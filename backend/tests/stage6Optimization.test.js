const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../app');

const readExample = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8')
);

describe('Stage 6 optimization API integration', () => {
  test('POST /api/optimize returns Pareto, hybrid, and cost break-even analysis', async () => {
    const payload = {
      ...readExample('stage6_hybrid_request_DEMO.json'),
      metrics_by_tier: readExample('stage6_pareto_tradeoff_metrics_DEMO.json'),
      cost_curves: readExample('stage6_cost_curves_DEMO.json')
    };

    const response = await request(app).post('/api/optimize').send(payload);

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.body.scores)).toHaveLength(4);
    expect(response.body.details.benchmark.status).toBe('matched');
    expect(response.body.details.reliability.status).toBe('pass_with_caveats');
    expect(response.body.details.reliability.errors).toEqual([]);

    const optimization = response.body.details.optimization;
    expect(optimization.pareto.status).toBe('provisional_estimates');
    expect(optimization.pareto.non_dominated_tiers.length).toBeGreaterThan(0);
    expect(optimization.hybrid.status).toBe('candidate_requires_validation');
    expect(optimization.hybrid.nodes).toHaveLength(4);
    expect(optimization.hybrid.connections).toHaveLength(3);
    expect(optimization.hybrid.local_memory).toEqual({
      model_ram_required_mb: 256,
      device_available_ram_mb: 1024,
      fits: true
    });
    expect(optimization.cost_break_even.status).toBe('modeled');
    expect(optimization.cost_break_even.scenario_id).toBe('demo-smart-camera-s25-qualcomm-2026-10');

    const crossing = optimization.cost_break_even.pairwise_break_even_points.find(
      (point) => point.tiers.join(',') === 'on_device,far_edge'
    );
    expect(crossing.monthly_requests).toBeCloseTo(8571.43, 2);
  });

  test('POST /api/optimize uses illustrative metrics and omits unmatched cost curves', async () => {
    const base = readExample('stage6_hybrid_request_DEMO.json');
    const payload = {
      ...base,
      workload: {
        ...base.workload,
        target_device: 'Samsung Galaxy S24',
        runtime: 'ONNX Runtime',
        precision: 'w8a8'
      },
      metrics_by_tier: {}
    };

    const response = await request(app).post('/api/optimize').send(payload);

    expect(response.statusCode).toBe(200);
    expect(response.body.details.optimization.pareto.status).toBe('provisional_estimates');
    expect(response.body.details.optimization.pareto.non_dominated_tiers.length).toBeGreaterThan(0);
    expect(response.body.details.optimization.cost_break_even.status).toBe('not_available');
    expect(response.body.details.optimization.cost_break_even.reason).toMatch(/workload-matched/);
  });

  test('POST /api/optimize does not propose hybrid when remote processing is prohibited', async () => {
    const payload = {
      ...readExample('stage6_hybrid_request_DEMO.json'),
      workload: {
        ...readExample('stage6_hybrid_request_DEMO.json').workload,
        allow_remote_processing: false
      },
      metrics_by_tier: readExample('stage6_pareto_tradeoff_metrics_DEMO.json')
    };

    const response = await request(app).post('/api/optimize').send(payload);

    expect(response.statusCode).toBe(200);
    expect(response.body.details.optimization.hybrid.status).toBe('not_proposed');
    expect(response.body.details.optimization.hybrid.reasons).toContain(
      'Explicit allow_remote_processing=true is required to propose a hybrid split'
    );
  });

  test('POST /api/optimize does not let hybrid bypass the allowed tier policy', async () => {
    const base = readExample('stage6_hybrid_request_DEMO.json');
    const payload = {
      ...base,
      workload: { ...base.workload, allowed_tiers: ['on_device'] },
      metrics_by_tier: readExample('stage6_pareto_tradeoff_metrics_DEMO.json')
    };

    const response = await request(app).post('/api/optimize').send(payload);

    expect(response.statusCode).toBe(200);
    expect(response.body.details.optimization.hybrid.status).toBe('not_proposed');
    expect(response.body.details.optimization.hybrid.nodes).toEqual([]);
    expect(response.body.details.optimization.hybrid.reasons).toContain(
      'No eligible remote analytics tier'
    );
  });
});
