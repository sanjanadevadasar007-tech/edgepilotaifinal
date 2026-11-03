jest.mock('../services/pythonEngineBridge', () => ({
  callTeamEngine: jest.fn()
}));

const { callTeamEngine } = require('../services/pythonEngineBridge');
const {
  calculateSuitability,
  costCurvesMatchWorkload,
  normalizeWorkload
} = require('../services/suitabilityService');
const { getMetricsForWorkload } = require('../services/stage3MetricService');

describe('suitability service input contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callTeamEngine.mockResolvedValue({ recommended_tier: null, scores: {} });
  });

  test('normalizes user-facing aliases before sending inputs to the scoring engine', async () => {
    const workload = {
      latency_target: 200,
      budget: 200,
      privacy: ' LOW ',
      criticality: 'HIGH',
      bandwidth_requirement: 'medium'
    };

    await calculateSuitability(workload);

    expect(normalizeWorkload(workload)).toEqual({
      latency_requirement_ms: 200,
      budget_monthly: 200,
      privacy_requirement: 'low',
      criticality: 'high',
      bandwidth_requirement: 'medium'
    });
    expect(callTeamEngine).toHaveBeenCalledWith('recommend', {
      workload: normalizeWorkload(workload),
      metrics_by_tier: getMetricsForWorkload(workload).metrics_by_tier,
      cost_curves: null
    });
  });

  test('normalizes numeric strings from API clients before scoring', async () => {
    await calculateSuitability({
      latency_requirement_ms: '50',
      bandwidth_requirement: 'medium',
      budget_monthly: '1000',
      privacy_requirement: 'high',
      criticality: 'high'
    });

    expect(callTeamEngine).toHaveBeenCalledWith('recommend', expect.objectContaining({
      workload: expect.objectContaining({
        latency_requirement_ms: 50,
        budget_monthly: 1000
      })
    }));
  });

  test('retains the evidence used by scoring for report generation', async () => {
    const result = await calculateSuitability({
      latency_requirement_ms: 50,
      budget_monthly: 1000,
      privacy_requirement: 'high',
      criticality: 'high',
      bandwidth_requirement: 'medium'
    });

    expect(result.metrics_by_tier).toHaveProperty('on_device');
    expect(result.evidence_mode).toBe('illustrative_estimates');
  });

  test('selects bundled cost curves when all workload identifiers match case-insensitively', () => {
    const curves = getMetricsForWorkload().cost_curves;
    const workload = Object.fromEntries(
      Object.entries(curves.workload_match).map(([field, value]) => [field, ` ${value.toUpperCase()} `])
    );

    expect(costCurvesMatchWorkload(workload, curves)).toBe(curves);
  });

  test('does not select a cost curve profile when any required identifier differs or is missing', () => {
    const curves = getMetricsForWorkload().cost_curves;
    const workload = { ...curves.workload_match, runtime: 'ONNX Runtime' };

    expect(costCurvesMatchWorkload(workload, curves)).toBeNull();
    expect(costCurvesMatchWorkload({ ...curves.workload_match, precision: undefined }, curves)).toBeNull();
  });
});
