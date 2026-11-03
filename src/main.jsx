import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  checkBackendHealth,
  getCounterfactuals,
  getOptimization,
  getRecommendation,
  getRecommendationReport,
  simulateWorkload,
} from './services/api.js';
import './styles.css';

const HeroScene = lazy(() => import('./components/HeroScene.jsx'));
let activeLenis = null;

const TIERS = ['On-device', 'Far edge', 'Regional edge', 'Cloud'];
const INITIAL_WORKLOAD = {
  latency_requirement_ms: 50,
  bandwidth_requirement: 'medium',
  budget_monthly: '1000',
  privacy_requirement: 'high',
  criticality: 'high',
};
const BENCHMARK_PROFILES = {
  mobilenetS25: {
    application_type: 'smart_camera',
    model_name: 'mobilenet_v2',
    target_device: 'Samsung Galaxy S25 (Family)',
    runtime: 'tflite',
    precision: 'float',
  },
  mobilenetS24: {
    application_type: 'smart_camera',
    model_name: 'mobilenet_v2',
    target_device: 'Samsung Galaxy S24',
    runtime: 'ONNX Runtime',
    precision: 'w8a8',
  },
};
const MOCK_RECOMMENDATION = {
  recommendation: 'Regional edge',
  rationale:
    'Illustrative routing for a balanced workload: latency, privacy, cost and resilience have competing requirements.',
  estimates: {
    latency_ms: 42,
    monthly_cost_inr: 1800,
  },
  scores: {
    'On-device': 78,
    'Far edge': 86,
    'Regional edge': 93,
    Cloud: 68,
  },
  warnings: [
    'Illustrative estimate — validate with measured workload traffic before production rollout.',
  ],
  tradeoffs: ['Requires a managed edge infrastructure layer.'],
  assumptions: ['Regional capacity is available near the primary user population.'],
};

const ROUTES = [
  ['/', 'Overview'],
  ['/analyzer', 'Analyzer'],
  ['/results', 'Results'],
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function navigateTo(path, setPath) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  setPath(path);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (activeLenis && !reduceMotion) {
    activeLenis.scrollTo(0, { immediate: true });
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function Header({ path, setPath, mockMode, setMockMode, health }) {
  const healthLabel = {
    checking: 'Checking backend',
    online: 'Backend online',
    offline: 'Backend unavailable',
  }[health];

  return (
    <header className="site-header">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          navigateTo('/', setPath);
        }}
        aria-label="EdgePilot AI overview"
      >
        <span className="orbit" aria-hidden="true" />
        <span>EdgePilot</span>
        <span className="brand-ai">AI</span>
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {ROUTES.map(([route, label]) => (
          <a
            key={route}
            href={route}
            className={path === route ? 'active' : ''}
            aria-current={path === route ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigateTo(route, setPath);
            }}
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <span className={`backend-status ${health}`} role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {healthLabel}
        </span>
        <button
          className="mode-toggle"
          type="button"
          aria-pressed={mockMode}
          onClick={() => setMockMode((enabled) => !enabled)}
        >
          {mockMode ? 'Mock mode on' : 'Use mock mode'}
        </button>
        <button
          className="button button-outline header-analyze"
          type="button"
          onClick={() => navigateTo('/analyzer', setPath)}
        >
          Analyze workload <span aria-hidden="true">↗</span>
        </button>
      </div>
    </header>
  );
}

const DEPLOYMENT_ROUTES = {
  'On-device': 'M400 216 C330 192 275 130 220 90',
  'Far edge': 'M400 216 C325 244 275 290 220 284',
  'Regional edge': 'M400 216 C475 244 525 290 580 284',
  Cloud: 'M400 216 C470 192 525 130 580 90',
};

const DEPLOYMENT_DETAILS = {
  'On-device': [
    'Private execution',
    'Closest to the data, with private, immediate execution.',
    'Local execution avoids a network hop and keeps data close to its source.',
  ],
  'Far edge': [
    'Nearby execution',
    'A nearby layer for low-latency, distributed workloads.',
    'Nearby compute trades some locality for distributed capacity.',
  ],
  'Regional edge': [
    'Regional placement preview',
    'A regional fabric balancing latency, data locality, and scale.',
    'Balances local responsiveness with broader shared capacity.',
  ],
  Cloud: [
    'Centralized execution',
    'Centralized capacity with room to scale.',
    'More distance can bring elastic, centralized capacity.',
  ],
};

function updatePointerLight(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    '--pointer-x',
    `${((event.clientX - bounds.left) / bounds.width) * 100}%`,
  );
  event.currentTarget.style.setProperty(
    '--pointer-y',
    `${((event.clientY - bounds.top) / bounds.height) * 100}%`,
  );
}

function DeploymentMapFallback() {
  const [selectedTier, setSelectedTier] = useState('Regional edge');
  const activePath = DEPLOYMENT_ROUTES[selectedTier];
  const [, detailCopy, detailContext] = DEPLOYMENT_DETAILS[selectedTier];
  const tierClass = selectedTier.toLowerCase().replaceAll(' ', '-');

  return (
    <div className="deployment-map-wrap">
      <section
        className={`deployment-map tier-${tierClass}`}
        aria-label="Illustrative workload deployment map"
        onPointerMove={updatePointerLight}
      >
        <div className="map-grid" aria-hidden="true" />
        <div className="map-technical-labels" aria-hidden="true">
          <span className="map-label-latency">LATENCY</span>
          <span className="map-label-compute">COMPUTE SIGNAL / 04</span>
          <span className="map-label-routing">MODEL ROUTING</span>
          <span className="map-label-locality">DATA LOCALITY</span>
          <span className="map-label-inference">INFERENCE</span>
        </div>
        <svg
          className="map-paths"
          viewBox="0 0 800 440"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="route-muted" d={DEPLOYMENT_ROUTES['On-device']} />
          <path className="route-muted" d={DEPLOYMENT_ROUTES['Far edge']} />
          <path className="route-muted" d={DEPLOYMENT_ROUTES['Regional edge']} />
          <path className="route-muted" d={DEPLOYMENT_ROUTES.Cloud} />
          <path className={`route-selected route-${tierClass}`} d={activePath} />
          <circle className="signal-dot" r="4">
            <animateMotion dur="5s" repeatCount="indefinite" path={activePath} />
          </circle>
          <circle className="signal-dot signal-dot-secondary" r="2.5">
            <animateMotion dur="7s" begin="-2.4s" repeatCount="indefinite" path={activePath} />
          </circle>
          <circle className="signal-dot signal-dot-secondary" r="2">
            <animateMotion dur="9s" begin="-5.8s" repeatCount="indefinite" path={activePath} />
          </circle>
        </svg>
        <button
          className={`map-node node-device ${selectedTier === 'On-device' ? 'is-active' : ''}`}
          type="button"
          aria-pressed={selectedTier === 'On-device'}
          onMouseEnter={() => setSelectedTier('On-device')}
          onFocus={() => setSelectedTier('On-device')}
          onClick={() => setSelectedTier('On-device')}
        >
          <span aria-hidden="true">▣</span>
          <strong>ON-DEVICE</strong>
          <small>private / immediate</small>
        </button>
        <button
          className={`map-node node-far ${selectedTier === 'Far edge' ? 'is-active' : ''}`}
          type="button"
          aria-pressed={selectedTier === 'Far edge'}
          onMouseEnter={() => setSelectedTier('Far edge')}
          onFocus={() => setSelectedTier('Far edge')}
          onClick={() => setSelectedTier('Far edge')}
        >
          <span aria-hidden="true">⌁</span>
          <strong>FAR EDGE</strong>
          <small>nearby / resilient</small>
        </button>
        <button
          className={`map-node node-regional ${selectedTier === 'Regional edge' ? 'is-active' : ''}`}
          type="button"
          aria-pressed={selectedTier === 'Regional edge'}
          onMouseEnter={() => setSelectedTier('Regional edge')}
          onFocus={() => setSelectedTier('Regional edge')}
          onClick={() => setSelectedTier('Regional edge')}
        >
          <span aria-hidden="true">⌘</span>
          <strong>REGIONAL EDGE</strong>
          <small>balanced / preview</small>
        </button>
        <button
          className={`map-node node-cloud ${selectedTier === 'Cloud' ? 'is-active' : ''}`}
          type="button"
          aria-pressed={selectedTier === 'Cloud'}
          onMouseEnter={() => setSelectedTier('Cloud')}
          onFocus={() => setSelectedTier('Cloud')}
          onClick={() => setSelectedTier('Cloud')}
        >
          <span aria-hidden="true">▤</span>
          <strong>CLOUD</strong>
          <small>elastic / centralized</small>
        </button>
        <div className="workload-node">
          <span className="workload-aura" aria-hidden="true" />
          <svg
            className="workload-wireframe"
            viewBox="0 0 100 100"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M50 4 77 17 94 43 84 73 58 94 27 86 7 61 12 30 32 10Z M50 4 58 94 M77 17 27 86 M94 43 7 61 M84 73 12 30 M32 10 84 73 M50 4 7 61 M77 17 58 94 M94 43 27 86 M12 30 58 94 M32 10 94 43 M7 61 84 73 M27 86 77 17" />
          </svg>
          <strong>AI</strong>
          <span>WORKLOAD</span>
        </div>
      </section>
      <div className="map-caption" aria-live="polite">
        <span>Illustrative preview only · Not based on your workload</span>
        <strong>{selectedTier}</strong>
        <p>{detailCopy}</p>
        <small>{detailContext}</small>
      </div>
    </div>
  );
}

class SceneErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Interactive deployment scene failed; using the illustrative SVG fallback.', error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function DeploymentMap() {
  const fallback = <DeploymentMapFallback />;

  return (
    <SceneErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <HeroScene />
      </Suspense>
    </SceneErrorBoundary>
  );
}

const DECISION_SIGNALS = [
  {
    name: 'LATENCY',
    detail: 'response time',
    explanation: 'Some tasks need to be completed very quickly, without waiting too long.',
    followUp: 'Doing the work closer to the user can help the system respond faster.',
  },
  {
    name: 'BANDWIDTH',
    detail: 'data movement',
    explanation: 'Some tasks need to send a lot of data over the internet.',
    followUp: 'Sending less data can make things work better when the internet is slow.',
  },
  {
    name: 'PRIVACY',
    detail: 'data locality',
    explanation: 'Some information is private and should not be shared with others.',
    followUp: 'Keeping private information closer to where it is collected can help protect it.',
  },
  {
    name: 'BUDGET',
    detail: 'monthly guardrail',
    explanation: 'Every task has a cost, and it is important to stay within the available budget.',
    followUp: 'Choosing a cheaper option can help save money while getting the work done.',
  },
  {
    name: 'RESILIENCE',
    detail: 'failure impact',
    explanation: 'Some tasks are very important and should keep working even when something goes wrong.',
    followUp: 'Having a backup system can help things continue working if the main system stops.',
  },
];

function SignalGraph() {
  const [selected, setSelected] = useState(0);
  const signal = DECISION_SIGNALS[selected];
  const positions = [
    { left: '50%', top: '5%' },
    { left: '86%', top: '34%' },
    { left: '74%', top: '81%' },
    { left: '25%', top: '81%' },
    { left: '14%', top: '34%' },
  ];

  return (
    <div className="signal-graph-wrap">
      <div className="visual-topline signal-topline">
        <span>DECISION SIGNALS / 05</span>
      </div>
      <div
        className="signal-graph"
        role="group"
        aria-label="Illustrative workload decision signals"
        onPointerMove={updatePointerLight}
      >
        <svg viewBox="0 0 600 430" preserveAspectRatio="none" aria-hidden="true">
          {DECISION_SIGNALS.map((item, index) => {
            const endPoints = [
              [300, 54, 300, 164],
              [516, 154, 367, 204],
              [444, 355, 340, 255],
              [156, 355, 260, 255],
              [84, 154, 233, 204],
            ][index];
            return (
              <line
                key={item.name}
                className={`signal-edge ${selected === index ? 'is-active' : ''}`}
                x1={endPoints[0]}
                y1={endPoints[1]}
                x2={endPoints[2]}
                y2={endPoints[3]}
              />
            );
          })}
          <line className="signal-travel" x1="300" y1="54" x2="300" y2="164" />
        </svg>
        <div className="signal-center">
          <strong>PLACEMENT</strong>
          <span>signal model</span>
        </div>
        {DECISION_SIGNALS.map((item, index) => (
          <button
            className={`signal-node signal-node-${index} ${selected === index ? 'is-active' : ''}`}
            style={positions[index]}
            key={item.name}
            type="button"
            aria-pressed={selected === index}
            onFocus={() => setSelected(index)}
            onClick={() => setSelected(index)}
          >
            <strong>{item.name}</strong>
            <small>{item.detail}</small>
          </button>
        ))}
      </div>
      <div className="signal-caption" aria-live="polite">
        <strong><i aria-hidden="true" /> {signal.name}</strong>
        <p>{signal.explanation} {signal.followUp}</p>
      </div>
      <p className="visual-caveat">Sample explanations only — no signal is being scored here.</p>
    </div>
  );
}

function PlacementLoop({ setPath }) {
  return (
    <section
      className="story-section placement-loop"
      aria-labelledby="loop-title"
      onPointerMove={updatePointerLight}
    >
      <div className="loop-heading">
        <p className="section-kicker">03 / FROM INPUT TO ROUTE</p>
        <h2 id="loop-title">Describe. Compare. <span>Deploy.</span></h2>
        <p>A workload becomes a recommendation through one transparent visual loop.</p>
      </div>
      <div className="loop-diagram">
        <div className="visual-topline loop-topline">
          <span>THE PLACEMENT LOOP / 03</span>
          <span>ONE SIGNAL <i aria-hidden="true">→</i> ONE ROUTE</span>
        </div>
        <div className="loop-rail" aria-label="Illustrative three-step placement loop">
          <svg viewBox="0 0 900 240" preserveAspectRatio="none" aria-hidden="true">
            <path className="loop-fog" d="M55 130 C210 40 275 205 450 120 S700 45 845 125" />
            <path className="loop-path" d="M55 130 C210 40 275 205 450 120 S700 45 845 125" />
            <circle className="loop-signal" r="4">
              <animateMotion
                dur="9s"
                repeatCount="indefinite"
                path="M55 130 C210 40 275 205 450 120 S700 45 845 125"
              />
            </circle>
            <circle className="loop-signal-static" cx="55" cy="130" r="4" />
          </svg>
          <article className="loop-step loop-step-1">
            <span className="loop-number">01</span>
            <strong>DESCRIBE WORKLOAD</strong>
            <small>requirements in</small>
          </article>
          <article className="loop-step loop-step-2">
            <span className="loop-number">02</span>
            <strong>COMPARE TIERS</strong>
            <small>signals aligned</small>
          </article>
          <article className="loop-step loop-step-3">
            <span className="loop-number">03</span>
            <strong>GET RECOMMENDATION</strong>
            <small>route out</small>
          </article>
        </div>
      </div>
      <button
        className="button button-primary loop-action"
        type="button"
        onClick={() => navigateTo('/analyzer', setPath)}
      >
        Analyze your workload <span aria-hidden="true">→</span>
      </button>
      <p className="visual-caveat">Illustrative workflow — recommendations require an actual analysis.</p>
    </section>
  );
}

function Overview({ setPath }) {
  return (
    <main className="overview-page">
      <section
        className="story-section overview-hero"
        aria-labelledby="overview-title"
        onPointerMove={updatePointerLight}
      >
        <section className="hero-copy">
          <h1
            id="overview-title"
            className="dot-grid-title"
            onPointerMove={updatePointerLight}
          >
            <span className="dot-grid-line" data-grid-text="Deploy AI">
              Deploy <span>AI</span>
            </span>
            <span className="dot-grid-line" data-grid-text="where it">
              where it
            </span>
            <span className="dot-grid-line" data-grid-text="performs best.">
              performs best.
            </span>
          </h1>
          <p className="hero-description">
            EdgePilot finds the right execution tier for your workload — balancing speed,
            privacy, cost, and scale.
          </p>
        </section>
      </section>
      <section
        className="story-section deployment-section"
        aria-labelledby="deployment-title"
        onPointerMove={updatePointerLight}
      >
        <div className="deployment-heading">
          <p className="section-kicker">01 / EXECUTION TIERS</p>
          <h2 id="deployment-title">One workload. Four places to run it.</h2>
        </div>
        <div className="deployment-visual">
          <DeploymentMap />
        </div>
        <div className="execution-summary">
          <span>FOUR TIERS / ONE WORKLOAD</span>
          <div className="execution-tiers" role="list">
            <div role="listitem">
              <strong>On-device</strong>
              <p>Private, immediate execution close to the data.</p>
            </div>
            <div role="listitem">
              <strong>Far edge</strong>
              <p>Nearby compute for responsive workloads.</p>
            </div>
            <div role="listitem">
              <strong>Regional edge</strong>
              <p>Balanced latency, locality, and scale.</p>
            </div>
            <div role="listitem">
              <strong>Cloud</strong>
              <p>Centralized capacity with room to scale.</p>
            </div>
          </div>
        </div>
      </section>
      <section
        className="story-section signals-section"
        aria-labelledby="signals-title"
        onPointerMove={updatePointerLight}
      >
        <div className="story-copy signals-copy">
          <p className="section-kicker">02 / DECISION SIGNALS</p>
          <h2 id="signals-title">
            Placement
            <br />
            follows
            <br />
            <span>the signal.</span>
          </h2>
          <p>
            Latency, bandwidth, privacy, budget, and resilience pull the route in
            different directions.
          </p>
        </div>
        <SignalGraph />
      </section>
      <PlacementLoop setPath={setPath} />
    </main>
  );
}

function SelectField({ label, name, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} value={value} onChange={onChange}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}

function WorkloadSignalPreview({ workload }) {
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef(null);
  const latency = Number(workload.latency_requirement_ms);
  const latencySignal = Math.round((latency / 1000) * 100);
  const bandwidthSignal = { low: 28, medium: 58, high: 88 }[workload.bandwidth_requirement];
  const privacySignal = { low: 28, medium: 58, high: 88 }[workload.privacy_requirement];
  const budget = Number(workload.budget_monthly);
  const budgetSignal = Number.isFinite(budget) ? Math.min(100, Math.max(0, (budget / 10000) * 100)) : 0;
  const values = [
    ['LATENCY', `${latency} ms`, latencySignal],
    ['BANDWIDTH', workload.bandwidth_requirement, bandwidthSignal],
    ['PRIVACY', workload.privacy_requirement, privacySignal],
    ['BUDGET', `₹${workload.budget_monthly || '0'}`, budgetSignal],
  ];
  const previewKey = [
    workload.latency_requirement_ms,
    workload.bandwidth_requirement,
    workload.privacy_requirement,
    workload.budget_monthly,
  ].join('|');

  useEffect(() => {
    setPulse(true);
    window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(false), 460);
    return () => window.clearTimeout(pulseTimer.current);
  }, [previewKey]);

  return (
    <section
      className={`workload-review ${pulse ? 'is-updating' : ''}`}
      aria-label="Live workload preview"
      aria-live="polite"
    >
      <div className="preview-heading">
        <div>
          <span className="preview-kicker">LIVE WORKLOAD PREVIEW</span>
          <strong>Signal profile</strong>
          <p className="preview-description">
            A visual summary of your current inputs. Bars are scaled for display, not scores.
          </p>
        </div>
      </div>

      <div className="preview-rail" aria-hidden="true">
        <span className="preview-rail-glow" />
        <i className="preview-particle preview-particle-one" />
        <i className="preview-particle preview-particle-two" />
        <i className="preview-particle preview-particle-three" />
      </div>

      <div className="preview-signals">
        {values.map(([label, value, intensity]) => (
          <div className="preview-signal" key={label}>
            <div className="preview-signal-meta">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <div className="preview-signal-meter" aria-hidden="true">
              <span style={{ '--signal-level': `${intensity}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="preview-disclaimer">
        Your inputs are sent for analysis only when you run it. No tier is recommended here.
      </p>
    </section>
  );
}

function Analyzer({ workload, setWorkload, onAnalyze, busy }) {
  const [applicationType, setApplicationType] = useState('');
  const [modelRamRequiredMb, setModelRamRequiredMb] = useState('');
  const [deviceAvailableRamMb, setDeviceAvailableRamMb] = useState('');
  const [benchmarkProfile, setBenchmarkProfile] = useState('');
  const [allowRemoteProcessing, setAllowRemoteProcessing] = useState(false);

  function updateWorkload(event) {
    const { name, value } = event.target;
    setWorkload((current) => ({
      ...current,
      [name]:
        name === 'latency_requirement_ms' ? Number(value) : value,
    }));
  }

  function increaseBudget() {
    setWorkload((current) => {
      const currentBudget = Number(current.budget_monthly);
      const nextBudget = (Number.isFinite(currentBudget) ? currentBudget : 0) + 1000;
      return { ...current, budget_monthly: String(nextBudget) };
    });
  }

  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const budget = Number(workload.budget_monthly);
    if (!Number.isFinite(budget) || budget < 0) return;

    const applicationTypeValue = applicationType.trim();
    onAnalyze({
      latency_requirement_ms: Number(workload.latency_requirement_ms),
      bandwidth_requirement: workload.bandwidth_requirement,
      budget_monthly: budget,
      privacy_requirement: workload.privacy_requirement,
      criticality: workload.criticality,
      allow_remote_processing: allowRemoteProcessing,
      ...(applicationTypeValue ? { application_type: applicationTypeValue } : {}),
      ...(modelRamRequiredMb !== '' ? { model_ram_required_mb: Number(modelRamRequiredMb) } : {}),
      ...(deviceAvailableRamMb !== '' ? { device_available_ram_mb: Number(deviceAvailableRamMb) } : {}),
      ...(benchmarkProfile ? BENCHMARK_PROFILES[benchmarkProfile] : {}),
    });
  }

  return (
    <main className="page analyzer-page" onPointerMove={updatePointerLight}>
      <div className="analyzer-atmosphere" aria-hidden="true">
        <span className="analyzer-orbit analyzer-orbit-one" />
        <span className="analyzer-orbit analyzer-orbit-two" />
        <span className="analyzer-signal-mark"><i /><i /><i /></span>
      </div>
      <header className="analyzer-hero">
        <p className="eyebrow analyzer-eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          WORKLOAD ANALYZER <span className="analyzer-eyebrow-meta">/ INPUT → ROUTE</span>
        </p>
        <h1 className="page-title">Shape your deployment <span>route.</span></h1>
        <div className="analyzer-hero-bottom">
          <p className="page-intro">
            Set the conditions your workload needs. Your live signal preview responds as you shape them.
          </p>
          <span className="analyzer-data-note">
            <i aria-hidden="true" />
            Required fields and any optional context are sent for analysis
          </span>
        </div>
      </header>
      <form className="form-card analyzer-form" onSubmit={submit}>
        <div className="analyzer-form-layout">
          <div className="analyzer-controls">
            <div className="latency-control">
              <label htmlFor="latency">
                <span>Latency requirement</span>
                <strong>{workload.latency_requirement_ms} ms</strong>
              </label>
              <input
                id="latency"
                name="latency_requirement_ms"
                type="range"
                min="1"
                max="1000"
                step="1"
                value={workload.latency_requirement_ms}
                onChange={updateWorkload}
                style={{ '--latency-progress': `${((Number(workload.latency_requirement_ms) - 1) / 999) * 100}%` }}
                aria-valuetext={`${workload.latency_requirement_ms} milliseconds`}
              />
              <div className="range-labels">
                <span>1 ms</span>
                <span>1,000 ms</span>
              </div>
            </div>
            <div className="form-grid">
              <SelectField
                label="Bandwidth requirement"
                name="bandwidth_requirement"
                value={workload.bandwidth_requirement}
                onChange={updateWorkload}
              />
              <div className="field">
                <label htmlFor="budget-monthly">Monthly budget <small>(INR)</small></label>
                <div className="currency-input">
                  <span aria-hidden="true">₹</span>
                  <input
                    id="budget-monthly"
                    name="budget_monthly"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={workload.budget_monthly}
                    onChange={updateWorkload}
                    inputMode="decimal"
                  />
                  <button
                    className="budget-increment"
                    type="button"
                    aria-label="Increase monthly budget by ₹1,000"
                    onClick={increaseBudget}
                  >
                    +1,000
                  </button>
                </div>
              </div>
              <SelectField
                label="Privacy requirement"
                name="privacy_requirement"
                value={workload.privacy_requirement}
                onChange={updateWorkload}
              />
              <SelectField
                label="Criticality"
                name="criticality"
                value={workload.criticality}
                onChange={updateWorkload}
              />
            </div>
          </div>

          <WorkloadSignalPreview workload={workload} />
        </div>
        <fieldset className="optional-fields">
          <legend>Optional workload context — included in analysis</legend>
          <div className="form-grid">
            <label className="field">
              <span>Application type</span>
              <input
                type="text"
                maxLength={128}
                value={applicationType}
                onChange={(event) => setApplicationType(event.target.value)}
                placeholder="e.g. smart_camera"
              />
              <small>
                Use a workload label such as smart_camera to match evidence; benchmark profiles provide their own label.
              </small>
            </label>
            <label className="field">
              <span>Model RAM required <small>(MB)</small></span>
              <input
                id="model-ram-required"
                type="number"
                min="0.001"
                step="any"
                inputMode="decimal"
                value={modelRamRequiredMb}
                onChange={(event) => setModelRamRequiredMb(event.target.value)}
                placeholder="e.g. 256"
              />
            </label>
            <label className="field">
              <span>Available device RAM <small>(MB)</small></span>
              <input
                id="device-available-ram"
                type="number"
                min="0.001"
                step="any"
                inputMode="decimal"
                value={deviceAvailableRamMb}
                onChange={(event) => setDeviceAvailableRamMb(event.target.value)}
                placeholder="e.g. 1024"
              />
            </label>
          </div>
          <p className="technical-note">
            RAM values are optional and inform on-device memory feasibility. They are not inferred from parameter count.
          </p>
          <label className="remote-processing-option">
            <input
              type="checkbox"
              checked={allowRemoteProcessing}
              onChange={(event) => setAllowRemoteProcessing(event.target.checked)}
            />
            <span>
              <strong>Allow remote processing</strong>
              <small>
                Lets the engine evaluate hybrid options that send permitted work remotely. This does not guarantee a hybrid proposal.
              </small>
            </span>
          </label>
        </fieldset>
        <fieldset className="optional-fields benchmark-profile-fields">
          <legend>Optional Qualcomm inference benchmark match</legend>
          <label className="field" htmlFor="benchmark-profile">
            <span>Benchmark profile</span>
            <select
              id="benchmark-profile"
              value={benchmarkProfile}
              onChange={(event) => setBenchmarkProfile(event.target.value)}
            >
              <option value="">No specific model/device</option>
              <option value="mobilenetS25">MobileNet V2 · Galaxy S25 · TFLite · float</option>
              <option value="mobilenetS24">MobileNet V2 · Galaxy S24 · ONNX Runtime · W8A8</option>
            </select>
            <small>
              Only exact profile matches are returned. Inference latency is not end-to-end latency. The Galaxy S25 profile can also match illustrative cost curves.
            </small>
          </label>
        </fieldset>
        <div className="form-submit">
          {busy && (
            <p className="loading-message" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              Reading workload constraints…
            </p>
          )}
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Analyzing…' : 'Run placement analysis'}
            {!busy && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </form>
    </main>
  );
}

function DemoNotice() {
  return (
    <div className="notice demo-notice">
      Demo mode is on. Results are illustrative UI examples, not real benchmarks or
      probabilities.
    </div>
  );
}

function readScores(result, allowIllustrativeScores) {
  const source =
    result.scores || result.tier_scores || result.suitability_scores || {};
  const illustrative = MOCK_RECOMMENDATION.scores;

  return TIERS.map((tier) => {
    const snakeCase = normalizeTierKey(tier);
    const hyphenCase = snakeCase.replaceAll('_', '-');
    const score =
      source[tier] ?? source[snakeCase] ?? source[hyphenCase] ??
      (allowIllustrativeScores ? illustrative[tier] : undefined);
    const numericScore =
      score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score))
        ? Number(score)
        : null;

    return [tier, numericScore];
  });
}

function normalizeTierKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function formatTierName(value) {
  return TIERS.find((tier) => normalizeTierKey(tier) === normalizeTierKey(value)) ?? value;
}

function DeploymentRouteDiagram({
  recommendation,
  scores,
  hasResult,
  resultSource,
  workload,
  workloadLabel = 'Inputs used for this result',
}) {
  const [motionAllowed, setMotionAllowed] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const selectedTier = TIERS.find(
    (tier) => normalizeTierKey(tier) === normalizeTierKey(recommendation),
  );
  const selectedId = selectedTier ? `route-${normalizeTierKey(selectedTier)}` : null;
  const destinations = [
    { tier: TIERS[0], y: 45 },
    { tier: TIERS[1], y: 113 },
    { tier: TIERS[2], y: 181 },
    { tier: TIERS[3], y: 249 },
  ];

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setMotionAllowed(!preference.matches);
    preference.addEventListener('change', updateMotionPreference);
    return () => preference.removeEventListener('change', updateMotionPreference);
  }, []);

  return (
    <div className="deployment-route">
      <div className="deployment-route-heading">
        <span>WORKLOAD ROUTING</span>
        <span>
          {resultSource === 'mock'
            ? 'ILLUSTRATIVE SCORES'
            : hasResult
              ? 'SERVICE SCORES / 100'
              : 'PLACEMENT TIERS / 04'}
        </span>
      </div>
      <div
        className="deployment-route-canvas"
        role="region"
        aria-label="Routing diagram with service scores for each deployment tier"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 520 294"
          role="img"
          aria-label={
            hasResult
              ? `Workload routing and service scores: ${scores.map(([tier, score]) => `${tier}, ${score === null ? 'not provided' : `${score} out of 100`}`).join('; ')}. ${selectedTier ? `${selectedTier} is the recommended tier.` : `The service returned ${recommendation}, which does not match a displayed tier.`}`
              : 'Workload connected to four deployment tiers. Run an analysis to see the service recommendation.'
          }
        >
          <defs>
            <radialGradient id="route-core-glow">
              <stop offset="0" stopColor="#c8b4ff" stopOpacity=".72" />
              <stop offset="1" stopColor="#8769e8" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="route-selected-gradient" x1="0" x2="1">
              <stop offset="0" stopColor="#7abdd2" />
              <stop offset="1" stopColor="#c0a0ff" />
            </linearGradient>
          </defs>
          {destinations.map(({ tier, y }) => {
            const id = `route-${normalizeTierKey(tier)}`;
            const path = `M 118 147 C 220 147, 225 ${y}, 359 ${y}`;
            const selected = hasResult && id === selectedId;
            const score = scores.find(([scoreTier]) => scoreTier === tier)?.[1] ?? null;

            return (
              <g key={tier}>
                <path id={id} className={`route-path ${selected ? 'is-selected' : ''}`} d={path} />
                {selected && (
                  <>
                    <path className="route-path route-path-highlight" d={path} />
                    {motionAllowed ? (
                      <circle className="route-packet" r="3.5" aria-hidden="true">
                        <animateMotion dur="5s" repeatCount="indefinite">
                          <mpath href={`#${id}`} />
                        </animateMotion>
                      </circle>
                    ) : (
                      <circle
                        className="route-packet"
                        cx="239"
                        cy={(147 + y) / 2}
                        r="3.5"
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
                <circle
                  className={`route-destination ${selected ? 'is-selected' : ''}`}
                  cx="359"
                  cy={y}
                  r={selected ? '8' : '5'}
                />
                {selected && (
                  <circle className="route-destination-halo" cx="359" cy={y} r="18" />
                )}
                <text className={`route-label ${selected ? 'is-selected' : ''}`} x="386" y={y - 3}>
                  {tier}
                </text>
                <text className={`route-score ${score === null ? 'is-missing' : ''}`} x="386" y={y + 13}>
                  {score === null ? 'SCORE NOT PROVIDED' : `SCORE ${score} / 100`}
                </text>
                {score !== null && (
                  <>
                    <rect className="route-score-track" x="386" y={y + 19} width="92" height="3" rx="1.5" />
                    <rect
                      className={`route-score-fill ${selected ? 'is-selected' : ''}`}
                      x="386"
                      y={y + 19}
                      width={Math.max(0, Math.min(92, score * 0.92))}
                      height="3"
                      rx="1.5"
                    />
                  </>
                )}
                {selected && (
                  <text className="route-selected-label" x="386" y={y + 33}>
                    RECOMMENDED
                  </text>
                )}
              </g>
            );
          })}
          <circle className="route-core-halo" cx="87" cy="147" r="56" fill="url(#route-core-glow)" />
          <circle className="route-core-ring" cx="87" cy="147" r="31" />
          <circle className="route-core" cx="87" cy="147" r="19" />
          <text className="route-core-title" x="87" y="145" textAnchor="middle">AI</text>
          <text className="route-core-caption" x="87" y="161" textAnchor="middle">WORKLOAD</text>
          {!hasResult && (
            <text className="route-empty-caption" x="258" y="286" textAnchor="middle">
              A ROUTE APPEARS AFTER ANALYSIS
            </text>
          )}
        </svg>
      </div>
      {hasResult && isRecord(workload) && (
        <div className="deployment-route-inputs">
          <strong>{workloadLabel}</strong>
          <div className="deployment-route-input-list">
            {[
              ['Latency target', workload.latency_requirement_ms == null ? null : `${workload.latency_requirement_ms} ms`],
              ['Data-transfer need', workload.bandwidth_requirement],
              ['Privacy', workload.privacy_requirement],
              ['Monthly budget', workload.budget_monthly == null ? null : `₹${Number(workload.budget_monthly).toLocaleString()} / month`],
              ['Criticality', workload.criticality],
              ['Network', typeof workload.network_available === 'boolean' ? (workload.network_available ? 'Available' : 'Unavailable') : null],
              ['Model / device RAM', workload.model_ram_required_mb != null && workload.device_available_ram_mb != null
                ? `${workload.model_ram_required_mb} / ${workload.device_available_ram_mb} MB`
                : null],
              ['Available network speed', workload.bandwidth_available_mbps == null ? null : `${workload.bandwidth_available_mbps} Mbps`],
              ['Minimum network speed', workload.minimum_network_bandwidth_mbps == null ? null : `${workload.minimum_network_bandwidth_mbps} Mbps`],
              ['Concurrent users', workload.concurrent_users == null ? null : Number(workload.concurrent_users).toLocaleString()],
              ['Remote processing', typeof workload.allow_remote_processing === 'boolean' ? (workload.allow_remote_processing ? 'Allowed' : 'Not allowed') : null],
              ['Offline-only', typeof workload.require_offline === 'boolean' ? (workload.require_offline ? 'Yes' : 'No') : null],
            ].filter(([, value]) => value != null && value !== '').map(([label, value]) => (
              <span key={label}><small>{label}</small><strong>{value}</strong></span>
            ))}
          </div>
          <small className="deployment-route-input-note">
            Optional inputs not listed here were not supplied. The diagram is a schematic, not a geographic map.
          </small>
        </div>
      )}
      <div className="deployment-route-legend">
        {hasResult ? (
          <span>The highlighted route and scores come from the service response; scores are not benchmark measurements.</span>
        ) : (
          <>
            <span><i /> Workload signal</span>
            <span><i /> Possible tier</span>
          </>
        )}
      </div>
    </div>
  );
}

function humanizeRecommendationNote(item, kind, { workload, recommendation, details }) {
  if (typeof item !== 'string') return JSON.stringify(item);
  const text = item.toLowerCase();
  const tierLabel = typeof recommendation === 'string' && recommendation
    ? formatTierName(recommendation)
    : 'the selected tier';
  const tierKey = normalizeTierKey(recommendation);

  if (kind === 'warnings') {
    if (text.startsWith('demo heuristics:')) {
      return 'These scores are rough comparisons for this demo. They are not probabilities or measured deployment rankings.';
    }
    if (text.startsWith('reported metric values for the winner')) {
      const estimate = details?.tier_estimates?.[tierKey] || {};
      const metrics = [
        estimate.latency_ms != null ? `latency (${estimate.latency_source || 'not sourced'})` : null,
        estimate.monthly_cost_inr != null ? `monthly cost (${estimate.cost_source || 'not sourced'})` : null,
      ].filter(Boolean);
      return `For ${tierLabel}, ${metrics.length ? metrics.join(' and ') : 'the reported values'} are estimates, not verified measurements or provider quotes.`;
    }
    if (text.startsWith('recommended tier is not fully verified')) {
      const gaps = details?.evidence_gaps?.[tierKey];
      return Array.isArray(gaps) && gaps.length
        ? `Some checks for ${tierLabel} are still unverified. See “Evidence limitations by tier” in the Reliability Audit section.`
        : `Some checks for ${tierLabel} are still unverified; see the Reliability Audit section.`;
    }
    if (text.startsWith('matched qualcomm benchmark measures only model inference')) {
      return 'The matching device benchmark covers model inference only. It was not used as end-to-end latency or to change the tier ranking.';
    }
    if (text.startsWith('the selected tier has an estimated sla overrun')) {
      const checks = details?.sla_checks?.[tierKey] || {};
      const breaches = [
        checks.latency_status === 'provisional_fail' ? 'latency' : null,
        checks.cost_status === 'provisional_fail' ? 'monthly cost' : null,
      ].filter(Boolean);
      return `The estimate for ${tierLabel}${breaches.length ? ` exceeds the entered ${breaches.join(' and ')} limit` : ' may exceed an entered limit'}. This is provisional, not a measured failure.`;
    }
    if (text.startsWith('one or more deployment tiers failed hard feasibility checks')) {
      return 'Some deployment choices were excluded because they conflict with the workload constraints.';
    }
    if (text.startsWith('no tier has both latency and cost evidence')) {
      return 'The service could not select a tier because the available latency and cost evidence did not satisfy the limits.';
    }
    if (text.startsWith('on-device memory feasibility is unverified')) {
      return workload?.model_ram_required_mb == null || workload?.device_available_ram_mb == null
        ? 'The model memory need and available device memory were not both supplied, so local fit could not be checked.'
        : 'The service could not verify whether this model fits the device memory.';
    }
    if (text.startsWith('some tier costs are unknown')) {
      return 'Some tier prices were not provided. The scoring model uses a neutral placeholder for those costs, not a real price.';
    }
    if (text.startsWith('reported metric values')) {
      return `Some displayed values for ${tierLabel} are estimates, not measured results or provider quotes.`;
    }
  }

  if (kind === 'trade-offs') {
    if (text.includes('local hardware capacity and thermal/power limits')) {
      return 'The model must fit the device and stay within its power and heat limits.';
    }
    if (text.includes('model updates, monitoring and scaling across devices')) {
      return 'Updating and monitoring the model across devices takes extra operational work.';
    }
    if (text.includes('requires deployed far-edge infrastructure')) {
      return 'This option needs nearby edge infrastructure and a working network connection.';
    }
    if (text.includes('compute availability and latency depend on the exact access-network location')) {
      return 'Actual speed and availability depend on where the nearby edge server is located.';
    }
    if (text.includes('requires regional edge infrastructure')) {
      return 'This option needs regional edge infrastructure and a working network connection.';
    }
    if (text.includes('off-device processing needs suitable data protection')) {
      return 'Data leaves the device, so suitable privacy and access controls are needed.';
    }
    if (text.includes('network transfer adds variability')) {
      return 'Sending data over a network can add delay and may increase running costs.';
    }
    if (text.includes('privacy, data residency and service outages')) {
      return 'Plan for privacy, where data is stored, and what happens during a service outage.';
    }
    if (text.startsWith('no deployment tier passes')) {
      return 'No available option met both the entered latency and monthly cost limits.';
    }
  }

  if (kind === 'assumptions') {
    if (text.startsWith("'bandwidth_requirement' means")) {
      const demand = workload?.bandwidth_requirement || 'not provided';
      return `Your data-transfer need is set to ${demand}. This describes how much data the application needs to send; it is not a measured internet speed.`;
    }
    if (text.startsWith('tier profiles are illustrative ordinal assumptions')) {
      return 'The tier profiles are demo assumptions, not device benchmark results.';
    }
    if (text.startsWith('far edge is modeled as access-network compute')) {
      return 'In this comparison, “far edge” means nearby access-network computing; “regional edge” means a more distant regional data center.';
    }
    if (text.startsWith('high criticality increases resilience priority')) {
      return `Criticality is set to ${workload?.criticality || 'not provided'}. A higher setting gives resilience more weight; it does not promise uptime or automatic failover.`;
    }
    if (text.startsWith('low positive bandwidth by itself')) {
      return `The supplied network speed (${workload?.bandwidth_available_mbps} Mbps) is compared with the minimum (${workload?.minimum_network_bandwidth_mbps} Mbps). The data-transfer need (${workload?.bandwidth_requirement}) is a separate input and is not a measured speed.`;
    }
    if (text.startsWith('only confirmed constraints eliminate options')) {
      return 'Only constraints confirmed by the supplied inputs exclude options. Missing device or network details remain unknown.';
    }
    if (text.startsWith('a neutral affordability prior of 50')) {
      return 'When a tier price is unknown, the scoring model uses a neutral affordability placeholder. It is not a price estimate.';
    }
    if (text.startsWith('selected tier metric provenance:')) {
      const estimate = details?.tier_estimates?.[tierKey] || {};
      return `For ${tierLabel}, the latency value is ${estimate.latency_source || 'not provided'} and the monthly cost is ${estimate.cost_source || 'not provided'}.`;
    }
  }

  return item;
}

function isRelevantRecommendationNote(item, kind, { workload, details }) {
  if (kind !== 'assumptions' || typeof item !== 'string') return true;
  const text = item.toLowerCase();
  if (text.startsWith('a neutral affordability prior of 50')) {
    return Object.values(details?.score_breakdown || {}).some(
      (tier) => tier?.affordability?.origin === 'unknown_neutral_prior',
    );
  }
  if (text.startsWith('low positive bandwidth by itself')) {
    return workload?.bandwidth_available_mbps != null
      && workload?.minimum_network_bandwidth_mbps != null;
  }
  return true;
}

function InfoCard({ title, items, emptyMessage, kind, workload, recommendation, details }) {
  const values = Array.isArray(items) && items.length > 0
    ? items.filter((item) => isRelevantRecommendationNote(item, kind, { workload, details }))
    : [];
  const displayValues = values.length > 0
    ? values
    : emptyMessage
      ? [emptyMessage]
      : values.length === 0 && Array.isArray(items) && items.length > 0
        ? ['No additional model assumptions apply to the supplied workload.']
        : [emptyMessage || `No ${title.toLowerCase()} returned by the service.`];
  const cardKind = kind || title.toLowerCase().replace(/[^a-z]+/g, '-');
  const icon = { warnings: '!', 'trade-offs': '↔', assumptions: '⌁' }[cardKind] ?? '◈';

  return (
    <section className={`info-card info-card-${cardKind} panel`}>
      <h2>
        <span className="info-card-icon" aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <ul>
        {displayValues.map((item, index) => (
          <li key={`${title}-${index}`}>
            {humanizeRecommendationNote(item, cardKind, { workload, recommendation, details })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ParetoPlot({ pareto, feasibility, slaChecks }) {
  const entries = Object.entries(isRecord(pareto?.compared_tiers) ? pareto.compared_tiers : {})
    .map(([tier, metrics]) => ({ tier, ...metrics }))
    .filter((entry) =>
      entry.end_to_end_latency_ms !== null
      && entry.end_to_end_latency_ms !== undefined
      && entry.monthly_cost_inr !== null
      && entry.monthly_cost_inr !== undefined
      && Number.isFinite(Number(entry.end_to_end_latency_ms))
      && Number.isFinite(Number(entry.monthly_cost_inr)));
  const frontier = new Set(Array.isArray(pareto?.non_dominated_tiers) ? pareto.non_dominated_tiers : []);
  const maxLatency = Math.max(1, ...entries.map((entry) => Number(entry.end_to_end_latency_ms)));
  const maxCost = Math.max(1, ...entries.map((entry) => Number(entry.monthly_cost_inr)));
  const plot = { left: 80, right: 585, top: 34, bottom: 246 };
  const x = (latency) => plot.left + (Number(latency) / maxLatency) * (plot.right - plot.left);
  const y = (cost) => plot.bottom - (Number(cost) / maxCost) * (plot.bottom - plot.top);
  const numberLabel = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const eligibleCount = entries.filter(
    (entry) => feasibility?.[normalizeTierKey(entry.tier)]?.eligible === true,
  ).length;
  const provisionalLatencyOverruns = entries.filter(
    (entry) => slaChecks?.[entry.tier]?.latency_status === 'provisional_fail',
  ).length;

  return (
    <figure className="insight-chart">
      {entries.length >= 2 ? (
        <>
          <div className="pareto-chart-viewport" tabIndex="0" aria-label="Scrollable Pareto trade-off chart">
            <svg className="pareto-chart-svg" viewBox="0 0 660 318" role="img" aria-label="Pareto chart comparing end-to-end latency and estimated monthly cost for compared tiers">
              {[0, 1, 2, 3, 4].map((step) => {
                const gridY = plot.bottom - step * (plot.bottom - plot.top) / 4;
                const gridX = plot.left + step * (plot.right - plot.left) / 4;
                return (
                  <g key={step}>
                    <line className="chart-grid-line" x1={plot.left} y1={gridY} x2={plot.right} y2={gridY} />
                    <line className="chart-grid-line" x1={gridX} y1={plot.top} x2={gridX} y2={plot.bottom} />
                    <text className="chart-tick" x={plot.left - 9} y={gridY + 3} textAnchor="end">
                      {numberLabel(maxCost * step / 4)}
                    </text>
                    <text className="chart-tick" x={gridX} y={plot.bottom + 17} textAnchor="middle">
                      {numberLabel(maxLatency * step / 4)}
                    </text>
                  </g>
                );
              })}
              <line className="chart-axis" x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} />
              <line className="chart-axis" x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.bottom} />
              <text className="chart-axis-label chart-x-axis-label" x="332" y="299" textAnchor="middle">End-to-end latency (ms)</text>
              <text className="chart-axis-label" transform="translate(17 140) rotate(-90)" textAnchor="middle">Estimated monthly cost (INR)</text>
              {entries.map((entry) => {
                const isFrontier = frontier.has(entry.tier);
                const key = normalizeTierKey(entry.tier);
                const latencyStatus = slaChecks?.[key]?.latency_status;
                const targetStatus = latencyStatus === 'provisional_fail'
                  ? 'Estimated latency provisionally exceeds the target'
                  : latencyStatus === 'fail'
                    ? 'Measured latency exceeds the target'
                    : latencyStatus === 'provisional_pass'
                      ? 'Estimated latency provisionally meets the target'
                      : latencyStatus === 'pass'
                        ? 'Measured latency meets the target'
                        : 'Latency target status unavailable';
                const eligibility = feasibility?.[key]?.eligible === true
                  ? 'Eligible for ranking'
                  : feasibility?.[key]?.eligible === false
                    ? `Not eligible: ${(feasibility[key].reasons || []).join('; ') || 'backend marked ineligible'}`
                    : 'Eligibility status unavailable';
                const evidenceType = `Latency evidence: ${entry.latency_source || 'unknown'}; cost evidence: ${entry.cost_source || 'unknown'}`;
                const title = `${formatTierName(entry.tier)}: ${numberLabel(entry.end_to_end_latency_ms)} ms end-to-end latency, INR ${numberLabel(entry.monthly_cost_inr)} monthly cost. ${evidenceType}. ${isFrontier ? 'Pareto-optimal (non-dominated).' : 'Dominated.'} ${eligibility}. ${targetStatus}.`;
                return (
                  <g key={entry.tier} className={`chart-point ${isFrontier ? 'is-frontier' : 'is-dominated'}`}>
                    <title>{title}</title>
                    {isFrontier
                      ? <circle cx={x(entry.end_to_end_latency_ms)} cy={y(entry.monthly_cost_inr)} r="7" />
                      : <rect x={x(entry.end_to_end_latency_ms) - 5} y={y(entry.monthly_cost_inr) - 5} width="10" height="10" />}
                    <text x={x(entry.end_to_end_latency_ms) + 10} y={y(entry.monthly_cost_inr) - 8}>
                      {formatTierName(entry.tier)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {entries.length >= 2 && (
            <>
              <p className="chart-scroll-note">Swipe horizontally to inspect all tiers and latency values.</p>
              <p className="chart-x-axis-mobile">End-to-end latency (ms)</p>
            </>
          )}
        </>
      ) : (
        <div className="insight-empty-visual" role="status">
          <i /><i /><i /><span>Need two comparable tiers</span>
        </div>
      )}
      {entries.length >= 2 && (
        <div className="pareto-chart-legend" aria-label="Chart legend">
          <span><i className="is-frontier" /> Pareto-optimal (non-dominated)</span>
          <span><i className="is-dominated" /> Dominated</span>
          <span>{eligibleCount} of {entries.length} compared tiers eligible for ranking</span>
          {provisionalLatencyOverruns > 0 && (
            <span>{provisionalLatencyOverruns} tier(s) provisionally exceed the estimated latency target</span>
          )}
        </div>
      )}
      <figcaption>
        {entries.length >= 2
          ? `${entries.length} tiers with cost and latency evidence plotted. Pareto status compares only these values; eligibility and provisional target checks are shown separately.`
          : 'A Pareto comparison needs at least two tiers with both latency and cost data.'}
      </figcaption>
    </figure>
  );
}

function humanizeCostCurveNote(value) {
  if (typeof value !== 'string') return '';
  if (/no workload-matched, sourced cost curves from person 3/i.test(value)) {
    return 'No cost curves are available for this exact workload profile. Break-even needs a matching application type, model, target device, runtime, and precision, plus cost assumptions.';
  }
  if (/person 3 must supply validated provider\/hardware unit economics/i.test(value)) {
    return 'Illustrative estimate only; validated provider prices and hardware operating costs are not available.';
  }
  return value.replace(/Person 3's linear cost assumptions/gi, 'the simple assumptions used for these cost estimates');
}

function BreakEvenVisual({ analysis, feasibility }) {
  const costs = isRecord(analysis?.estimated_cost_at_reference_inr)
    ? Object.entries(analysis.estimated_cost_at_reference_inr)
      .filter(([, value]) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    : [];
  const crossings = Array.isArray(analysis?.pairwise_break_even_points)
    ? analysis.pairwise_break_even_points
    : [];
  const curvesUsed = isRecord(analysis?.curves_used) ? analysis.curves_used : {};
  const highestCost = Math.max(1, ...costs.map(([, value]) => Number(value)));
  const maxRequests = Math.max(
    Number(analysis?.reference_monthly_requests) || 0,
    ...crossings.map((item) => Number(item.valid_volume_range?.[1] ?? item.monthly_requests) || 0),
    ...Object.values(curvesUsed).map((curve) => Number(curve.valid_volume_range?.[1]) || 0),
    1,
  );
  const canPlotBreakEven = crossings.length > 0 || analysis?.status === 'modeled';
  const unavailableTierReasons = Array.isArray(analysis?.unavailable_at_reference)
    ? analysis.unavailable_at_reference
      .filter((tier) => feasibility?.[normalizeTierKey(tier)]?.eligible === false)
      .map((tier) => {
        const reasons = feasibility[normalizeTierKey(tier)]?.reasons;
        const reasonText = Array.isArray(reasons) && reasons.length > 0
          ? reasons.join('; ').replace(/[.]+$/, '')
          : 'not eligible for this workload';
        return `${formatTierName(tier)}: ${reasonText}`;
      })
    : [];
  const unavailableMessage = analysis?.status === 'not_available'
    ? analysis.reason || 'No workload-matched cost-curve evidence was returned.'
    : analysis?.status === 'insufficient_curves'
      ? `Only ${Object.keys(curvesUsed).length} eligible tier${Object.keys(curvesUsed).length === 1 ? '' : 's'} had usable cost curves; at least two are required to calculate a crossover.${unavailableTierReasons.length > 0 ? ` Excluded tiers: ${unavailableTierReasons.join('. ')}.` : ''}`
      : crossings.length === 0
        ? 'No pairwise cost-curve crossover was returned within the available volume ranges.'
        : 'No break-even point was returned by the backend.';

  return (
    <div className="breakeven-visual">
      {costs.length > 0 && (
        <div className="reference-cost-chart" role="img" aria-label="Modeled monthly cost at the reference usage volume">
          <p>Modeled monthly cost at {Number(analysis.reference_monthly_requests).toLocaleString()} requests</p>
          {costs.map(([tier, value]) => (
            <div className="reference-cost-row" key={tier}>
              <span>{formatTierName(tier)}</span>
              <div className="reference-cost-track">
                <i style={{ width: `${Math.max(3, Number(value) / highestCost * 100)}%` }} />
              </div>
              <strong>₹{Number(value).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
      {canPlotBreakEven ? (
        <div
          className="break-even-chart"
          role="img"
          aria-label={crossings.length > 0
            ? 'Modeled request volumes where pairs of tier cost curves cross'
            : 'No crossover within the valid ranges of the modeled tier cost curves'}
        >
          <p>Modeled cost crossover by monthly request volume</p>
          <div className="break-even-axis"><span>0</span><span>{maxRequests.toLocaleString()} requests</span></div>
          {crossings.length > 0 ? (
            crossings.map((point, index) => {
              const validRange = Array.isArray(point.valid_volume_range)
                && point.valid_volume_range.length === 2
                && point.valid_volume_range.every((value) => Number.isFinite(Number(value)))
                ? point.valid_volume_range.map(Number)
                : null;
              return (
                <div className="break-even-point-row" key={`${point.tiers?.join('-')}-${point.monthly_requests}-${index}`}>
                  <span>
                    {point.tiers?.map(formatTierName).join(' ↔ ') || 'Tier crossover'}
                    {validRange && <small>Valid {validRange[0].toLocaleString()}–{validRange[1].toLocaleString()} requests/mo</small>}
                  </span>
                  <div className="break-even-track">
                    <i style={{ left: `${Math.min(100, Number(point.monthly_requests) / maxRequests * 100)}%` }} />
                  </div>
                  <strong>{Number(point.monthly_requests).toLocaleString()} / mo</strong>
                </div>
              );
            })
          ) : (
            <p className="insight-caption">No crossover falls within the valid ranges of these modeled cost curves.</p>
          )}
        </div>
      ) : (
        <div className="insight-empty-visual is-compact" role="status">
          <span>{humanizeCostCurveNote(unavailableMessage)}</span>
        </div>
      )}
      {Object.keys(curvesUsed).length > 0 && (
        <details className="insight-footnote">
          <summary>Cost curve sources and assumptions</summary>
          <ul>
            {Object.entries(curvesUsed).map(([tier, curve]) => (
              <li key={tier}>
                <strong>{formatTierName(tier)} — {curve.source || 'source unavailable'}:</strong>{' '}
                {humanizeCostCurveNote(curve.source_reference) || 'Source reference unavailable.'}{' '}
                {Array.isArray(curve.valid_volume_range) && (
                  <>Valid for {curve.valid_volume_range[0]}–{curve.valid_volume_range[1]} requests/month. </>
                )}
                {Array.isArray(curve.assumptions) && curve.assumptions.join(' ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {analysis?.status !== 'not_available' && (
        <p className="insight-caption">
          {humanizeCostCurveNote(analysis?.note || analysis?.reason) || 'These are modeled costs, not provider quotes or guaranteed savings.'}
        </p>
      )}
    </div>
  );
}

function HybridFlow({ hybrid, workload, feasibility }) {
  const localMemory = isRecord(hybrid?.local_memory) ? hybrid.local_memory : {};
  const modelRam = localMemory.model_ram_required_mb ?? workload?.model_ram_required_mb;
  const deviceRam = localMemory.device_available_ram_mb ?? workload?.device_available_ram_mb;
  const hasKnownMemory = modelRam !== null && modelRam !== undefined
    && deviceRam !== null && deviceRam !== undefined
    && Number.isFinite(Number(modelRam)) && Number(modelRam) > 0
    && Number.isFinite(Number(deviceRam)) && Number(deviceRam) > 0;
  const memoryFits = hasKnownMemory && Number(modelRam) <= Number(deviceRam);
  const onDeviceEligible = feasibility?.on_device?.eligible === true;
  const remoteTier = normalizeTierKey(hybrid?.remote_analytics_tier);
  const remoteTierEligible = remoteTier.length > 0
    && feasibility?.[remoteTier]?.eligible === true;
  const remoteTierAllowed = !Array.isArray(workload?.allowed_tiers)
    || workload.allowed_tiers.includes(remoteTier);
  const remotePolicyAllowsCandidate = workload?.allow_remote_processing === true
    && workload?.require_offline !== true
    && workload?.network_available !== false
    && workload?.bandwidth_available_mbps !== 0
    && remoteTierEligible
    && remoteTierAllowed;
  const candidateNodes = Array.isArray(hybrid?.nodes) ? hybrid.nodes : [];
  const canShowCandidate = hybrid?.status === 'candidate_requires_validation'
    && candidateNodes.length > 0
    && memoryFits
    && onDeviceEligible
    && remotePolicyAllowsCandidate;

  if (!canShowCandidate) {
    const reasons = new Set(Array.isArray(hybrid?.reasons) ? hybrid.reasons : []);
    if (!hasKnownMemory) {
      reasons.add('Local model memory requirement and available device memory must be provided');
    } else if (!memoryFits) {
      reasons.add(`Local model requires ${Number(modelRam).toLocaleString()} MB RAM but device has ${Number(deviceRam).toLocaleString()} MB available`);
    }
    if (!onDeviceEligible) reasons.add('On-device stage is excluded by hard constraints');
    if (workload?.allow_remote_processing !== true) {
      reasons.add('Explicit allow_remote_processing=true is required to propose a hybrid split');
    }
    if (workload?.require_offline === true) reasons.add('Offline-only policy prohibits remote analytics');
    if (workload?.network_available === false || workload?.bandwidth_available_mbps === 0) {
      reasons.add('No available network path for the optional remote stage');
    }
    if (!remoteTierEligible || !remoteTierAllowed) reasons.add('No eligible remote analytics tier');
    if (reasons.size === 0) reasons.add('The backend did not confirm a validated hybrid candidate.');
    const plainReasons = [...reasons].map((reason) => {
      if (reason.includes('allow_remote_processing=true')) return 'Remote processing is turned off in the Analyzer.';
      if (reason.includes('Offline-only policy')) return 'This workload requires offline use, so remote analytics is not allowed.';
      if (reason.includes('No available network path')) return 'No network connection is available for the optional remote step.';
      if (reason.includes('On-device stage is excluded')) return 'A hard workload rule prevents the required on-device step.';
      if (reason.includes('memory requirement and available device memory must be provided')) {
        return 'Enter both the model memory needed and device memory available to check local fit.';
      }
      if (reason.includes('does not fit available device memory')) return 'The model needs more memory than the device has available.';
      if (reason.includes('No eligible remote analytics tier')) return 'No remote option meets this workload’s hard constraints.';
      return reason;
    });
    return (
      <div className="hybrid-unavailable">
        <div>
          <strong>Hybrid diagram unavailable</strong>
          <p>The inputs or service rules do not currently allow a safe local-plus-remote design.</p>
          {plainReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      </div>
    );
  }
  const nodes = candidateNodes;
  const connections = Array.isArray(hybrid.connections) ? hybrid.connections : [];
  const localNodes = nodes.filter((node) => node.type === 'device');
  const remoteNodes = nodes.filter((node) => node.type === 'edge' || node.type === 'cloud');
  const handoff = connections.find((edge) => (
    localNodes.some((node) => node.id === edge.source)
    && remoteNodes.some((node) => node.id === edge.target)
  ));
  const stepDescriptions = {
    data_source: 'Workload data starts here.',
    critical_inference: 'Time-sensitive AI work stays on the device.',
    data_minimization: 'Filter results before anything is sent.',
  };
  const plainValidationChecks = (check) => {
    if (check.startsWith('Validate that local inference')) {
      return 'Confirm the model runs on the target device; enough memory alone does not prove compatibility.';
    }
    if (check.startsWith('Validate that only permitted, minimized data')) {
      return 'Confirm only allowed, minimized information leaves the device; do not assume anonymization is perfect.';
    }
    if (check.startsWith('Measure data-transfer')) {
      return 'Measure transfer time, optional analysis delay, and total operating cost.';
    }
    if (check.startsWith('Verify encrypted communication')) {
      return 'Before launch, check encryption, access rules, data location, and consent.';
    }
    if (check.startsWith('Validate remote service failure handling')) {
      return 'Make sure critical local decisions still work if the remote service fails.';
    }
    if (check.startsWith('High privacy:')) {
      return 'For this high-privacy workload, confirm which fields may be sent and the legal basis for sending them.';
    }
    return check;
  };

  return (
    <>
      <div className="hybrid-simple-flow" role="group" aria-label="Hybrid processing keeps the main AI decision local and sends only approved summaries for optional remote analysis">
        <section className="hybrid-simple-stage is-local">
          <span>Proposed · on-device processing</span>
          <ol>
            {localNodes.map((node, index) => (
              <li key={node.id}>
                <i aria-hidden="true">{index + 1}</i>
                <span>
                  <strong>{node.role === 'data_source' ? 'Input' : node.role === 'critical_inference' ? 'AI decision' : 'Filter'}</strong>
                  <small>{stepDescriptions[node.role] || 'This step stays on the device.'}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="hybrid-memory-check" role="status">
            <strong>Local RAM fit: confirmed</strong>
            <span>
              Model requires {Number(modelRam).toLocaleString()} MB; device has {Number(deviceRam).toLocaleString()} MB available.
            </span>
          </div>
        </section>
        <div className="hybrid-simple-handoff">
          <span>Optional transfer</span>
          <strong>{handoff?.data === 'approved summaries only'
            ? 'Only approved summaries leave the device.'
            : handoff?.data || 'Only permitted information is sent.'}</strong>
          <i aria-hidden="true">→</i>
        </div>
        <section className="hybrid-simple-stage is-remote">
          <span>Optional · {formatTierName(hybrid.remote_analytics_tier || remoteNodes[0]?.label || 'Remote tier')}</span>
          <strong>{remoteNodes[0]?.label || 'Remote analysis'}</strong>
          <p>Extra analysis can happen here. It is not needed for the immediate on-device decision.</p>
        </section>
      </div>
      {Array.isArray(hybrid.validation_checks) && hybrid.validation_checks.length > 0 && (
        <details className="hybrid-checks">
          <summary>What must be checked before use <span>{hybrid.validation_checks.length} items</span></summary>
          <ul>{hybrid.validation_checks.map((check) => <li key={check}>{plainValidationChecks(check)}</li>)}</ul>
        </details>
      )}
      <p className="insight-caption">
        This is a possible design, not a deployment recommendation. Check device fit, privacy, network, reliability, and total cost before using it.
      </p>
    </>
  );
}

function ReliabilitySummary({ audit, evidenceGaps }) {
  if (!isRecord(audit)) {
    return <p className="insight-caption">No audit result was returned by the backend.</p>;
  }
  const statusLabels = {
    pass: 'Checks passed',
    pass_with_caveats: 'Passed with caveats',
    fail: 'Checks failed',
  };
  const categories = Array.isArray(audit.check_categories) ? audit.check_categories : [];

  return (
    <>
      <div className={`reliability-status is-${audit.status || 'unknown'}`}>
        <span aria-hidden="true">{audit.status === 'fail' ? '!' : '✓'}</span>
        <div>
          <strong>{statusLabels[audit.status] || 'Audit status unavailable'}</strong>
          <small>{audit.method || 'Internal consistency audit'}</small>
        </div>
      </div>
      <div className="audit-category-list" aria-label="Audit check categories">
        {categories.map((category) => (
          <span key={category}><i aria-hidden="true" />{category.replaceAll('_', ' ')}</span>
        ))}
      </div>
      {Array.isArray(audit.errors) && audit.errors.length > 0 && (
        <ul className="audit-findings is-error">{audit.errors.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
      {Array.isArray(audit.warnings) && audit.warnings.length > 0 && (
        <ul className="audit-findings">{audit.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
      {isRecord(evidenceGaps) && Object.keys(evidenceGaps).length > 0 && (
        <details className="insight-footnote">
          <summary>Evidence limitations by tier</summary>
          <ul>
            {Object.entries(evidenceGaps).map(([tier, gaps]) => (
              <li key={tier}>
                <strong>{formatTierName(tier)}:</strong>{' '}
                {Array.isArray(gaps)
                  ? gaps.join(' ')
                  : typeof gaps === 'string'
                    ? gaps
                    : 'Evidence details unavailable.'}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="audit-scope">
        {audit.audit_scope || 'Internal decision consistency audit only.'} It does not guarantee real-world deployment performance or independently verify measurements.
      </p>
    </>
  );
}

function Results({
  resultData,
  resultSource,
  reportWorkload,
  simulationData,
  simulating,
  onSimulate,
  onScenarioChange,
  setPath,
  onReport,
  reporting,
}) {
  const baselineLatency = Number(reportWorkload?.latency_requirement_ms ?? 50);
  const [scenarioLatency, setScenarioLatency] = useState(baselineLatency);
  const baselinePrivacy = reportWorkload?.privacy_requirement;
  const [scenarioPrivacy, setScenarioPrivacy] = useState(baselinePrivacy ?? 'medium');
  const baselineNetworkAvailable = reportWorkload?.network_available;
  const [scenarioNetworkAvailable, setScenarioNetworkAvailable] = useState(
    typeof baselineNetworkAvailable === 'boolean' ? baselineNetworkAvailable : null,
  );
  const baselineDeviceRam = reportWorkload?.device_available_ram_mb;
  const baselineModelRam = reportWorkload?.model_ram_required_mb;
  const hasModelRamRequirement =
    baselineModelRam != null && baselineModelRam !== '' &&
    Number.isFinite(Number(baselineModelRam)) && Number(baselineModelRam) > 0;
  const [scenarioDeviceRam, setScenarioDeviceRam] = useState(
    baselineDeviceRam == null ? '' : String(baselineDeviceRam),
  );
  const [counterfactualTarget, setCounterfactualTarget] = useState('');
  const [counterfactualData, setCounterfactualData] = useState(null);
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);
  const [counterfactualError, setCounterfactualError] = useState('');
  const [optimizationData, setOptimizationData] = useState(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationError, setOptimizationError] = useState('');
  const [selectedCounterfactual, setSelectedCounterfactual] = useState(0);
  useEffect(() => {
    setScenarioLatency(baselineLatency);
    setScenarioPrivacy(baselinePrivacy ?? 'medium');
    setScenarioNetworkAvailable(
      typeof baselineNetworkAvailable === 'boolean' ? baselineNetworkAvailable : null,
    );
    setScenarioDeviceRam(baselineDeviceRam == null ? '' : String(baselineDeviceRam));
  }, [baselineLatency, baselinePrivacy, baselineNetworkAvailable, baselineDeviceRam]);
  useEffect(() => {
    let active = true;
    setCounterfactualData(null);
    setCounterfactualError('');
    setCounterfactualTarget('');
    setOptimizationData(null);
    setOptimizationError('');
    setOptimizationLoading(false);
    setSelectedCounterfactual(0);

    if (resultSource === 'live' && reportWorkload) {
      setOptimizationLoading(true);
      getOptimization(reportWorkload)
        .then((responseData) => {
          if (active) setOptimizationData(responseData);
        })
        .catch((requestError) => {
          if (active) {
            setOptimizationError(
              requestError instanceof Error && requestError.message
                ? requestError.message
                : 'Optimization analysis failed.',
            );
          }
        })
        .finally(() => {
          if (active) setOptimizationLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [resultData, resultSource, reportWorkload]);
  const hasResult = resultSource !== null;
  const hasLiveResult = resultSource === 'live';
  const result = isRecord(resultData)
    ? resultData
    : {};
  const simulationResponse = isRecord(simulationData) ? simulationData : null;
  const hasSimulation = simulationResponse !== null;
  const scenarioResult = isRecord(simulationResponse?.scenario)
    ? simulationResponse.scenario
    : {};
  const currentResult = hasSimulation ? scenarioResult : result;
  const recommendation =
    result.recommendation || result.recommended_tier || 'Not provided';
  const recommendationLabel = formatTierName(recommendation);
  const estimates = isRecord(result.estimates) ? result.estimates : {};
  const latency = estimates.latency_ms ?? result.latency_estimate_ms;
  const monthlyCost = estimates.monthly_cost ?? estimates.monthly_cost_inr ?? result.monthly_cost;
  const costCurrency =
    estimates.currency ?? result.currency ?? (estimates.monthly_cost_inr != null ? 'INR' : null);
  const monthlyCostLabel =
    monthlyCost == null || monthlyCost === '' || !costCurrency
      ? 'Not provided'
      : costCurrency.toUpperCase() === 'INR'
        ? `₹${monthlyCost}`
        : `${monthlyCost} ${costCurrency.toUpperCase()}`;
  const scores = readScores(result, resultSource === 'mock');
  const resultDetails = isRecord(result.details) ? result.details : {};
  const benchmark = isRecord(resultDetails.benchmark) ? resultDetails.benchmark : null;
  const detailedResult = isRecord(optimizationData?.details) ? optimizationData.details : resultDetails;
  const optimization = isRecord(detailedResult.optimization) ? detailedResult.optimization : null;
  const reliability = isRecord(detailedResult.reliability) ? detailedResult.reliability : null;
  const evidenceGaps = isRecord(detailedResult.evidence_gaps) ? detailedResult.evidence_gaps : null;
  const feasibility = isRecord(detailedResult.feasibility) ? detailedResult.feasibility : {};
  const slaChecks = isRecord(detailedResult.sla_checks) ? detailedResult.sla_checks : {};
  const comparison =
    isRecord(simulationResponse?.comparison)
      ? simulationResponse.comparison
      : null;
  const scoreDeltas = isRecord(comparison?.score_deltas) ? comparison.score_deltas : {};
  const scenarioScores = TIERS.map((tier) => {
    const entry = Object.entries(scoreDeltas).find(
      ([name]) => normalizeTierKey(name) === normalizeTierKey(tier),
    );
    return [tier, isRecord(entry?.[1]) ? entry[1] : null];
  });
  const changedInputs = Array.isArray(comparison?.changed_inputs)
    ? comparison.changed_inputs.filter((item) => isRecord(item) && typeof item.field === 'string')
    : null;
  const displayedWorkload = { ...(isRecord(reportWorkload) ? reportWorkload : {}) };
  changedInputs?.forEach(({ field, after }) => {
    displayedWorkload[field] = after;
  });
  const metricsHandling = isRecord(comparison?.metrics_handling)
    ? comparison.metrics_handling
    : null;
  const scenarioFeasibility = isRecord(scenarioResult.details?.feasibility)
    ? Object.values(scenarioResult.details.feasibility).filter(isRecord)
    : [];
  const scenarioFeasibilityByTier = isRecord(scenarioResult.details?.feasibility)
    ? scenarioResult.details.feasibility
    : {};
  const hasFeasibleScenarioOption = scenarioFeasibility.some((tier) => tier.eligible === true);
  const hasNoScenarioRecommendation =
    comparison?.new_tier === null ||
    scenarioResult.recommended_tier === null ||
    scenarioResult.recommendation === null ||
    scenarioResult.details?.status === 'no_feasible_tier';
  const hasNoFeasibleScenarioTier =
    hasNoScenarioRecommendation &&
    scenarioFeasibility.length > 0 &&
    !hasFeasibleScenarioOption;
  const hasScenarioTier =
    !hasNoScenarioRecommendation &&
    typeof comparison?.new_tier === 'string' &&
    comparison.new_tier.length > 0;
  const highestScoredEligibleTier = hasNoScenarioRecommendation
    && hasFeasibleScenarioOption
    && metricsHandling?.mode === 'baseline_metrics_invalidated'
    ? scenarioScores
      .filter(([tier, delta]) =>
        scenarioFeasibilityByTier[normalizeTierKey(tier)]?.eligible === true
        && delta?.after !== null
        && delta?.after !== undefined
        && delta?.after !== ''
        && Number.isFinite(Number(delta?.after)))
      .sort((a, b) => Number(b[1].after) - Number(a[1].after))[0]?.[0] ?? null
    : null;
  const formatComparisonTier = (tier) => (
    typeof tier === 'string'
      ? formatTierName(tier)
      : tier === null
        ? 'No feasible tier'
        : 'Unavailable'
  );
  const scenarioResultMessage = hasNoFeasibleScenarioTier
    ? 'No feasible deployment tier found for the updated constraints.'
    : highestScoredEligibleTier
      ? `${formatComparisonTier(comparison?.original_tier)} → ${formatTierName(highestScoredEligibleTier)} has the highest returned score among eligible tiers. This is a provisional comparison, not a final recommendation.`
      : hasNoScenarioRecommendation
        ? 'The backend did not return a deployment recommendation for this scenario.'
        : comparison?.recommendation_changed === true && hasScenarioTier
          ? `The leading tier changed from ${formatComparisonTier(comparison.original_tier)} to ${formatComparisonTier(comparison.new_tier)}.`
          : comparison?.recommendation_changed === false && hasScenarioTier
            ? `The leading tier stayed at ${formatTierName(comparison.new_tier)}.`
            : typeof comparison?.explanation === 'string'
              ? comparison.explanation
              : 'Scenario result unavailable.';
  const formatScore = (value) => (
    value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
      ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
      : 'Unavailable'
  );
  const formatScenarioValue = (value) => {
    if (value === null || value === undefined) return 'Not provided';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const scenarioDeviceRamNumber = Number(scenarioDeviceRam);
  const hasValidScenarioDeviceRam =
    scenarioDeviceRam !== '' && Number.isFinite(scenarioDeviceRamNumber) && scenarioDeviceRamNumber > 0;
  const hasDeviceRamChange =
    hasModelRamRequirement && hasValidScenarioDeviceRam &&
    scenarioDeviceRamNumber !== Number(baselineDeviceRam);
  const hasLatencyChange = scenarioLatency !== baselineLatency;
  const hasPrivacyChange = scenarioPrivacy !== baselinePrivacy;
  const hasNetworkAvailabilityChange =
    typeof scenarioNetworkAvailable === 'boolean' &&
    scenarioNetworkAvailable !== baselineNetworkAvailable;
  const hasScenarioChange =
    hasLatencyChange || hasPrivacyChange || hasNetworkAvailabilityChange || hasDeviceRamChange;
  const benchmarkStatusLabel = benchmark?.status
    ? benchmark.status.replaceAll('_', ' ').toUpperCase()
    : hasLiveResult
      ? 'NOT RETURNED'
      : 'NOT REQUESTED';
  const counterfactualFields = [
    'latency_requirement_ms',
    'privacy_requirement',
    'bandwidth_requirement',
    'budget_monthly',
    'criticality',
    'concurrent_users',
    'require_offline',
    'allow_remote_processing',
    'network_available',
    'bandwidth_available_mbps',
    ...(hasModelRamRequirement ? ['device_available_ram_mb'] : []),
  ];
  const counterfactualFlips = Array.isArray(counterfactualData?.flips)
    ? counterfactualData.flips.filter(
      (flip) => isRecord(flip)
        && typeof flip.to_tier === 'string'
        && flip.to_tier.trim() !== '',
    )
    : [];
  const counterfactualGroups = Array.from(
    counterfactualFlips.reduce((groups, flip) => {
      const key = JSON.stringify([
        flip.field,
        normalizeTierKey(flip.from_tier),
        normalizeTierKey(flip.to_tier),
      ]);
      const group = groups.get(key) || { key, flips: [] };
      group.flips.push(flip);
      groups.set(key, group);
      return groups;
    }, new Map()).values(),
  );
  const selectedCounterfactualGroup = counterfactualGroups[selectedCounterfactual] || null;
  const selectedFlip = selectedCounterfactualGroup?.flips[0] || null;
  const formatCounterfactualField = (field) => ({
    latency_requirement_ms: 'Latency requirement',
    budget_monthly: 'Monthly budget',
    privacy_requirement: 'Privacy requirement',
    criticality: 'Criticality',
    device_available_ram_mb: 'Available device RAM',
    model_ram_required_mb: 'Model RAM required',
    network_available: 'Network availability',
    allow_remote_processing: 'Remote processing permission',
    bandwidth_available_mbps: 'Available network bandwidth',
    minimum_network_bandwidth_mbps: 'Minimum network bandwidth',
    concurrent_users: 'Concurrent users',
    require_offline: 'Offline requirement',
  }[field] || String(field || 'Input').replaceAll('_', ' '));
  const formatCounterfactualValue = (field, value) => {
    if (field === 'latency_requirement_ms') return `${formatScenarioValue(value)} ms`;
    if (field === 'budget_monthly') return `₹${formatScenarioValue(value)} / month`;
    if (field === 'device_available_ram_mb' || field === 'model_ram_required_mb') {
      return `${formatScenarioValue(value)} MB`;
    }
    if (field === 'bandwidth_available_mbps' || field === 'minimum_network_bandwidth_mbps') {
      return `${formatScenarioValue(value)} Mbps`;
    }
    if (field === 'concurrent_users') return `${formatScenarioValue(value)} users`;
    return formatScenarioValue(value);
  };
  const joinCounterfactualValues = (values) => (
    values.length < 2
      ? values[0] || ''
      : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`
  );
  const notesRecommendation = hasSimulation
    ? (typeof currentResult.recommended_tier === 'string'
      ? currentResult.recommended_tier
      : typeof currentResult.recommendation === 'string'
        ? currentResult.recommendation
        : null)
    : recommendation;

  async function runCounterfactuals() {
    if (!reportWorkload || !hasLiveResult) return;
    setCounterfactualLoading(true);
    setCounterfactualError('');
    setCounterfactualData(null);
    setSelectedCounterfactual(0);
    try {
      const responseData = await getCounterfactuals(reportWorkload, {
        fields: counterfactualFields,
        target_tier: counterfactualTarget || null,
        max_evaluations: 60,
        max_results: 30,
      });
      setCounterfactualData(responseData);
    } catch (requestError) {
      setCounterfactualError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'Counterfactual analysis failed.',
      );
    } finally {
      setCounterfactualLoading(false);
    }
  }

  async function runOptimization() {
    if (!reportWorkload || !hasLiveResult) return;
    setOptimizationLoading(true);
    setOptimizationError('');
    try {
      const responseData = await getOptimization(reportWorkload);
      setOptimizationData(responseData);
    } catch (requestError) {
      setOptimizationError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'Optimization analysis failed.',
      );
    } finally {
      setOptimizationLoading(false);
    }
  }

  return (
    <main className="page results-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            PLACEMENT INTELLIGENCE <span className="results-version">/ RESPONSE VIEW</span>
          </p>
          <h1 className="page-title">
            {hasResult ? 'Your deployment route.' : 'Ready when your workload is.'}
          </h1>
          <p className="results-intro">
            {hasResult
              ? 'A clear view of the recommendation and signals returned for this analysis.'
              : 'Run an analysis to see a deployment recommendation from the service.'}
          </p>
        </div>
        <button
          className="button button-outline"
          type="button"
          onClick={() => navigateTo('/analyzer', setPath)}
        >
          Adjust workload <span aria-hidden="true">↻</span>
        </button>
      </div>
      {resultSource === 'mock' && (
        <p className="source-tag">Illustrative mock response · not a live backend recommendation.</p>
      )}
      {!hasResult ? (
        <section className="results-empty panel">
          <span className="results-empty-orbit" aria-hidden="true"><i /></span>
          <div>
            <p className="technical-label">NO ANALYSIS YET</p>
            <h2>Your recommendation will appear here.</h2>
            <p>Nothing is estimated or selected until the recommendation service returns a result.</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={() => navigateTo('/analyzer', setPath)}
          >
            Analyze a workload <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : (
        <>
          <div className="results-grid">
            <section className="recommendation-card panel">
              <div className="recommendation-heading">
                <div>
                  <p className="technical-label">SERVICE RECOMMENDATION</p>
                  <h2>{recommendationLabel}</h2>
                </div>
                <span className={`recommendation-source ${hasLiveResult ? 'is-live' : 'is-sample'}`}>
                  <i aria-hidden="true" /> {hasLiveResult ? 'LIVE RESPONSE' : 'SAMPLE'}
                </span>
              </div>
              <DeploymentRouteDiagram
                recommendation={recommendation}
                scores={scores}
                hasResult={hasResult}
                resultSource={resultSource}
                workload={reportWorkload}
                workloadLabel={hasSimulation ? 'Baseline inputs for this recommendation' : undefined}
              />
              <div className="estimate-grid">
                <div>
                  <span>Latency estimate</span>
                  <strong>{latency == null ? 'Not provided' : `${latency} ms`}</strong>
                </div>
                <div>
                  <span>Monthly cost</span>
                  <strong>{monthlyCostLabel}</strong>
                </div>
              </div>
            </section>
          </div>
          <section className="what-if-card panel">
            <div className="what-if-mark" aria-hidden="true">
              <span />
              <i />
            </div>
            <div>
              <p className="technical-label">SCENARIO EXPLORATION</p>
              <h2>What if the workload constraints changed?</h2>
              <p>
                Recalculate the route with the backend simulator. This is hypothetical; it does not deploy anything.
              </p>
            </div>
            <div className="what-if-controls">
              <label htmlFor="scenario-latency">
                Latency target <strong>{scenarioLatency} ms</strong>
              </label>
              <input
                id="scenario-latency"
                type="range"
                min="1"
                max="1000"
                step="1"
                value={scenarioLatency}
                onChange={(event) => {
                  setScenarioLatency(Number(event.target.value));
                  onScenarioChange();
                }}
                disabled={simulating}
                aria-valuetext={`${scenarioLatency} milliseconds`}
              />
              <span className="what-if-control-label">Privacy requirement</span>
              <div className="what-if-segmented" role="group" aria-label="Privacy requirement">
                {['low', 'medium', 'high'].map((level) => (
                  <button
                    key={level}
                    className="what-if-segment"
                    type="button"
                    aria-pressed={scenarioPrivacy === level}
                    onClick={() => {
                      setScenarioPrivacy(level);
                      onScenarioChange();
                    }}
                    disabled={simulating}
                  >
                    {level[0].toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              <span className="what-if-control-label">Network availability</span>
              <div className="what-if-segmented" role="group" aria-label="Network availability">
                {[
                  [true, 'Available'],
                  [false, 'Unavailable'],
                ].map(([available, label]) => (
                  <button
                    key={label}
                    className="what-if-segment"
                    type="button"
                    aria-pressed={scenarioNetworkAvailable === available}
                    onClick={() => {
                      setScenarioNetworkAvailable(available);
                      onScenarioChange();
                    }}
                    disabled={simulating}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {typeof baselineNetworkAvailable !== 'boolean' && (
                <small>Network availability was not specified in the baseline workload.</small>
              )}
              {hasModelRamRequirement ? (
                <>
                  <label htmlFor="scenario-device-ram">
                    Available device RAM (MB)
                  </label>
                  <input
                    id="scenario-device-ram"
                    type="number"
                    min="0.001"
                    step="any"
                    inputMode="decimal"
                    value={scenarioDeviceRam}
                    onChange={(event) => {
                      setScenarioDeviceRam(event.target.value);
                      onScenarioChange();
                    }}
                    disabled={simulating}
                    aria-describedby="scenario-device-ram-note"
                  />
                  <small id="scenario-device-ram-note">
                    Baseline model RAM requirement: {Number(baselineModelRam)} MB. Change available RAM to test on-device feasibility.
                  </small>
                </>
              ) : (
                <small>
                  To simulate device RAM, add a valid Model RAM required (MB) value in the analyzer and run the analysis again.
                </small>
              )}
              <button
                className="button button-outline"
                type="button"
                aria-live="polite"
                onClick={() => onSimulate({
                  ...(hasLatencyChange ? { latency_requirement_ms: scenarioLatency } : {}),
                  ...(hasPrivacyChange ? { privacy_requirement: scenarioPrivacy } : {}),
                  ...(hasNetworkAvailabilityChange ? { network_available: scenarioNetworkAvailable } : {}),
                  ...(hasDeviceRamChange ? { device_available_ram_mb: scenarioDeviceRamNumber } : {}),
                })}
                disabled={!hasLiveResult || simulating || !hasScenarioChange}
              >
                {simulating ? 'Simulating…' : 'Simulate what-if'}
              </button>
            </div>
          </section>
          {hasSimulation && (
            <section className="scenario-result panel" aria-live="polite">
              <div className="scenario-result-heading">
                <div>
                  <p className="technical-label">BACKEND SCENARIO RESULT</p>
                  <h2>
                    {hasNoFeasibleScenarioTier
                      ? 'No feasible deployment tier'
                      : highestScoredEligibleTier
                        ? 'Highest-scoring eligible tier (provisional)'
                        : hasNoScenarioRecommendation
                          ? 'No recommendation selected'
                          : comparison?.recommendation_changed === true
                            ? 'The leading tier changed.'
                            : comparison?.recommendation_changed === false
                              ? 'The leading tier stayed the same.'
                              : 'Scenario result unavailable.'}
                  </h2>
                </div>
                <span>
                  {formatComparisonTier(comparison?.original_tier)}{' '}
                  →{' '}
                  {hasNoFeasibleScenarioTier
                    ? 'No feasible tier'
                    : highestScoredEligibleTier
                      ? `${formatTierName(highestScoredEligibleTier)} · highest score`
                      : hasNoScenarioRecommendation
                        ? 'No recommendation'
                        : hasScenarioTier
                          ? formatTierName(comparison.new_tier)
                          : formatComparisonTier(comparison?.new_tier)}
                </span>
              </div>
              <p>{scenarioResultMessage}</p>
              <p className={`scenario-feasibility ${hasNoFeasibleScenarioTier
                  ? 'is-infeasible'
                  : hasNoScenarioRecommendation
                    ? 'is-unavailable'
                    : ''
                }`}>
                {hasNoFeasibleScenarioTier
                  ? 'Feasibility: no feasible tier.'
                  : highestScoredEligibleTier
                    ? `Highest eligible score: ${formatTierName(highestScoredEligibleTier)}.`
                    : hasNoScenarioRecommendation && hasFeasibleScenarioOption
                      ? 'Some tiers pass hard feasibility checks, but there is not enough scenario evidence to select a winner.'
                      : hasNoScenarioRecommendation
                        ? 'Scenario feasibility could not be determined from the returned details.'
                        : hasScenarioTier
                          ? `Feasible scenario recommendation: ${formatTierName(comparison.new_tier)}.`
                          : 'Scenario feasibility unavailable.'}
              </p>
              <div className="scenario-changes">
                <h3>Changed inputs</h3>
                {changedInputs && changedInputs.length > 0 ? (
                  <ul>
                    {changedInputs.map(({ field, before, after }) => (
                      <li key={field}>
                        <strong>{field.replaceAll('_', ' ')}</strong>
                        <span>{formatScenarioValue(before)} → {formatScenarioValue(after)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{changedInputs ? 'No changed inputs returned.' : 'Changed inputs unavailable.'}</p>
                )}
              </div>
              <div className="scenario-score-grid" aria-label="Tier score changes">
                {scenarioScores.map(([tier, delta]) => (
                  <div
                    key={tier}
                    className={highestScoredEligibleTier === tier ? 'is-highest-scored' : ''}
                  >
                    <span>{tier}</span>
                    <strong>
                      <span>Before {formatScore(delta?.before)}</span>
                      <span>Scenario {formatScore(delta?.after)}</span>
                      {highestScoredEligibleTier === tier && (
                        <small className="score-highest">Highest eligible score · provisional</small>
                      )}
                      <small className={
                        Number(delta?.delta) > 0
                          ? 'score-up'
                          : Number(delta?.delta) < 0
                            ? 'score-down'
                            : ''
                      }>
                        Change {delta && Number.isFinite(Number(delta.delta))
                          ? `${Number(delta.delta) > 0 ? '+' : ''}${formatScore(delta.delta)}`
                          : 'Unavailable'}
                      </small>
                    </strong>
                  </div>
                ))}
              </div>
              {metricsHandling ? (
                <div className="scenario-metrics-note">
                  <strong>
                    {typeof metricsHandling.mode === 'string'
                      ? metricsHandling.mode.replaceAll('_', ' ')
                      : 'Evidence handling unavailable'}
                  </strong>
                  <p>{typeof metricsHandling.message === 'string' ? metricsHandling.message : 'Evidence handling explanation unavailable.'}</p>
                </div>
              ) : (
                <p className="scenario-metrics-note">Evidence handling unavailable.</p>
              )}
              {Array.isArray(comparison?.limitations) && comparison.limitations.length > 0 && (
                <ul className="scenario-limitations">
                  {comparison.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              )}
            </section>
          )}
          <section className="advanced-insights" aria-labelledby="advanced-insights-title">
            <div className="advanced-insights-heading">
              <div>
                <p className="technical-label">DECISION LAB · OPTIONAL ANALYSES</p>
                <h2 id="advanced-insights-title">See the trade-offs behind the route.</h2>
                <p>Explore alternatives and evidence without changing the service recommendation above.</p>
                {optimizationError && <p className="insight-error" role="alert">{optimizationError}</p>}
              </div>
              <div className="advanced-insights-actions">
                <span className="insight-orbit" aria-hidden="true"><i /><i /><i /></span>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={runOptimization}
                  disabled={!hasLiveResult || optimizationLoading}
                >
                  {optimizationLoading ? 'Updating analysis…' : optimization ? 'Refresh analysis' : 'Load trade-off analysis'}
                </button>
              </div>
            </div>

            <div className="advanced-insight-grid">
              <article className="advanced-insight-card panel counterfactual-card">
                <div className="insight-card-heading">
                  <span className="insight-index">01</span>
                  <div>
                    <p className="technical-label">COUNTERFACTUAL</p>
                    <h3>What could change the winner?</h3>
                  </div>
                </div>
                <p className="insight-card-intro">
                  Test latency, privacy, data-transfer need, budget, criticality, user load, network rules, remote permission, and available speed. Device RAM is tested when model RAM is supplied.
                </p>
                <div className="counterfactual-controls">
                  <label htmlFor="counterfactual-target">Look for a path to</label>
                  <select
                    id="counterfactual-target"
                    value={counterfactualTarget}
                    onChange={(event) => setCounterfactualTarget(event.target.value)}
                    disabled={counterfactualLoading || !hasLiveResult}
                  >
                    <option value="">Any different tier</option>
                    {TIERS.map((tier) => <option key={tier} value={normalizeTierKey(tier)}>{tier}</option>)}
                  </select>
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={runCounterfactuals}
                    disabled={!hasLiveResult || counterfactualLoading}
                  >
                    {counterfactualLoading ? 'Searching scenarios…' : counterfactualData ? 'Search again' : 'Find alternatives'}
                    {!counterfactualLoading && <span aria-hidden="true">↗</span>}
                  </button>
                </div>
                {counterfactualError && <p className="insight-error" role="alert">{counterfactualError}</p>}
                {counterfactualData && (
                  <div className="counterfactual-output" aria-live="polite">
                    <div className="counterfactual-summary">
                      <strong>{counterfactualGroups.length}</strong>
                      <span>distinct tier-change paths</span>
                      <small>{counterfactualData.evaluations ?? 0} scenarios checked</small>
                      <small>{counterfactualFlips.length} sampled inputs led to a tier change</small>
                      {counterfactualData.truncated === true && (
                        <small>Showing returned tier changes; the backend truncated its results.</small>
                      )}
                    </div>
                    {counterfactualGroups.length > 0 ? (
                      <>
                        <div className="counterfactual-path-list" role="list" aria-label="Possible changes">
                          {counterfactualGroups.map((group, index) => {
                            const flip = group.flips[0];
                            const sampledValues = Array.from(new Map(
                              group.flips.map((item) => [JSON.stringify(item.to), item.to]),
                            ).values());
                            return (
                              <button
                                className={`counterfactual-path ${selectedCounterfactual === index ? 'is-selected' : ''}`}
                                type="button"
                                key={group.key}
                                onClick={() => setSelectedCounterfactual(index)}
                                aria-pressed={selectedCounterfactual === index}
                              >
                                <span>{formatTierName(flip.from_tier)}</span>
                                <i aria-hidden="true">→</i>
                                <strong>{formatTierName(flip.to_tier)}</strong>
                                <small>
                                  {formatCounterfactualField(flip.field)} · {sampledValues.length} tested {sampledValues.length === 1 ? 'value' : 'values'}
                                </small>
                              </button>
                            );
                          })}
                        </div>
                        {selectedFlip && selectedCounterfactualGroup && (
                          <div className="counterfactual-detail">
                            <div className="counterfactual-change-visual">
                              <span>{formatCounterfactualField(selectedFlip.field)}</span>
                              <strong>
                                {formatCounterfactualValue(selectedFlip.field, selectedFlip.from)}
                                <i aria-hidden="true">→</i>
                                {joinCounterfactualValues(Array.from(new Map(
                                  selectedCounterfactualGroup.flips.map((flip) => [
                                    JSON.stringify(flip.to),
                                    formatCounterfactualValue(flip.field, flip.to),
                                  ]),
                                ).values()))}
                              </strong>
                            </div>
                            <p>
                              Starting from {formatCounterfactualValue(selectedFlip.field, selectedFlip.from)}, set {formatCounterfactualField(selectedFlip.field).toLowerCase()} to {joinCounterfactualValues(Array.from(new Map(
                                selectedCounterfactualGroup.flips.map((flip) => [
                                  JSON.stringify(flip.to),
                                  formatCounterfactualValue(flip.field, flip.to),
                                ]),
                              ).values()))}. Each tested value made {formatTierName(selectedFlip.to_tier)} the leading tier.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="insight-caption">No sampled input change switched to another feasible tier. Try a different target or input dimension.</p>
                    )}
                    {Array.isArray(counterfactualData.limitations) && counterfactualData.limitations.length > 0 && (
                      <details className="insight-footnote">
                        <summary>How to read these scenarios</summary>
                        <ul>{counterfactualData.limitations.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                      </details>
                    )}
                  </div>
                )}
                {!hasLiveResult && <p className="insight-caption">Run a live backend analysis to explore alternatives.</p>}
              </article>

              <article className="advanced-insight-card panel pareto-card">
                <div className="insight-card-heading">
                  <span className="insight-index">02</span>
                  <div>
                    <p className="technical-label">PARETO TRADE-OFF</p>
                    <h3>Speed versus monthly cost</h3>
                  </div>
                  {optimization?.pareto?.status && <span className="insight-status">{optimization.pareto.status.replaceAll('_', ' ')}</span>}
                </div>
                {optimization?.pareto ? (
                  <>
                    <ParetoPlot pareto={optimization.pareto} feasibility={feasibility} slaChecks={slaChecks} />
                    <p className="insight-caption">{optimization.pareto.note}</p>
                    {isRecord(optimization.pareto.excluded_or_missing) && Object.keys(optimization.pareto.excluded_or_missing).length > 0 && (
                      <details className="insight-footnote">
                        <summary>Why some tiers are missing</summary>
                        <ul>{Object.entries(optimization.pareto.excluded_or_missing).map(([tier, reason]) => <li key={tier}><strong>{formatTierName(tier)}:</strong> {reason}</li>)}</ul>
                      </details>
                    )}
                  </>
                ) : (
                  <div className="insight-unavailable">
                    <p>Compare tiers that offer different speed and cost trade-offs.</p>
                  </div>
                )}
              </article>

              <article className="advanced-insight-card panel breakeven-card">
                <div className="insight-card-heading">
                  <span className="insight-index">03</span>
                  <div>
                    <p className="technical-label">BREAK-EVEN</p>
                    <h3>When does cost cross over?</h3>
                  </div>
                  {optimization?.cost_break_even?.status && <span className="insight-status">{optimization.cost_break_even.status.replaceAll('_', ' ')}</span>}
                </div>
                {optimizationLoading && !optimization ? (
                  <div className="insight-empty-visual is-compact" role="status">
                    <span>Loading workload-matched cost analysis…</span>
                  </div>
                ) : optimization?.cost_break_even ? (
                  <BreakEvenVisual analysis={optimization.cost_break_even} feasibility={feasibility} />
                ) : (
                  <div className="insight-unavailable">
                    <div className="break-even-orbit" aria-hidden="true"><i /></div>
                    <p>Modelled cost curves can show when one tier’s monthly cost becomes lower.</p>
                  </div>
                )}
              </article>

              <article className="advanced-insight-card panel hybrid-card">
                <div className="insight-card-heading">
                  <span className="insight-index">04</span>
                  <div>
                    <p className="technical-label">HYBRID CONCEPT</p>
                    <h3>Keep critical work local</h3>
                  </div>
                  {optimization?.hybrid?.status && <span className="insight-status">{optimization.hybrid.status.replaceAll('_', ' ')}</span>}
                </div>
                {optimization?.hybrid ? (
                  <>
                    <HybridFlow
                      hybrid={optimization.hybrid}
                      workload={reportWorkload}
                      feasibility={feasibility}
                    />
                    <p className="insight-caption">
                      Remote processing is {reportWorkload?.allow_remote_processing === true ? 'allowed' : 'not allowed'} by your setting. Allowing it only lets the service evaluate this option; it does not prove the design is safe or ready to deploy.
                    </p>
                  </>
                ) : (
                  <div className="insight-unavailable">
                    <div className="hybrid-mini-visual" aria-hidden="true"><i /><i /><i /></div>
                    <p>See whether local inference and optional remote analytics could be combined.</p>
                  </div>
                )}
              </article>

              <article className="advanced-insight-card panel reliability-card">
                <div className="insight-card-heading">
                  <span className="insight-index">05</span>
                  <div>
                    <p className="technical-label">RELIABILITY AUDIT</p>
                    <h3>Did the result follow its rules?</h3>
                  </div>
                  {reliability?.status && <span className="insight-status">{reliability.status.replaceAll('_', ' ')}</span>}
                </div>
                {reliability ? (
                  <ReliabilitySummary audit={reliability} evidenceGaps={evidenceGaps} />
                ) : (
                  <div className="insight-unavailable">
                    <div className="audit-radar" aria-hidden="true"><i /><i /><i /></div>
                    <p>Check eligibility, evidence labels, and internal consistency.</p>
                  </div>
                )}
              </article>
            </div>
          </section>
          <div className="result-notes-heading">
            <h2>How to read these notes</h2>
            <p>
              {hasSimulation
                ? 'These service notes apply to the simulated workload in the scenario result below.'
                : 'These service notes apply to the analyzed workload shown above.'}
              Cautions describe limits in this result, trade-offs describe the selected tier, and assumptions describe how the model works.
            </p>
          </div>
          <div className="info-grid">
            <InfoCard
              title="Warnings"
              kind="warnings"
              items={currentResult.warnings}
              emptyMessage={hasSimulation ? 'Not returned for this simulation.' : undefined}
              workload={displayedWorkload}
              recommendation={notesRecommendation}
              details={currentResult.details}
            />
            <InfoCard
              title="Trade-offs"
              kind="trade-offs"
              items={currentResult.tradeoffs}
              emptyMessage={hasSimulation ? 'Not returned for this simulation.' : undefined}
              workload={displayedWorkload}
              recommendation={notesRecommendation}
              details={currentResult.details}
            />
            <InfoCard
              title="Model assumptions"
              kind="assumptions"
              items={currentResult.assumptions}
              emptyMessage={hasSimulation ? 'Not returned for this simulation.' : undefined}
              workload={displayedWorkload}
              recommendation={notesRecommendation}
              details={currentResult.details}
            />
          </div>
          <div className="result-actions">
            {hasLiveResult && (
              <button
                className="button button-primary"
                type="button"
                onClick={() => onReport(reportWorkload)}
                disabled={reporting}
              >
                {reporting ? 'Preparing PDF…' : 'Download recommendation PDF'}
                {!reporting && <span aria-hidden="true">↓</span>}
              </button>
            )}
          </div>
        </>
      )}
      <aside className="benchmark-status" aria-label="Qualcomm benchmark integration status">
        <span className="benchmark-status-icon" aria-hidden="true">◌</span>
        <span>
          <strong>BENCHMARK CATALOG · {benchmarkStatusLabel}</strong>
          <small>
            {benchmark?.status === 'matched'
              ? `${benchmark.model} on ${benchmark.device}: ${benchmark.inference_latency_ms} ms inference latency (${benchmark.runtime}, ${benchmark.precision}). ${benchmark.note} Source reported by backend: ${benchmark.source_reference}. Provenance is not independently verified.`
              : benchmark?.reason || (hasLiveResult
                ? 'No exact model, device, runtime, and precision match was returned for this workload.'
                : 'Run a live analysis with an optional benchmark profile to check for an exact match.')}
          </small>
        </span>
      </aside>
      <p className="fine-print">
        Benchmark measurements remain distinct from illustrative mock estimates and service-provided heuristic scores.
      </p>
    </main>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

function Footer({ health, overview }) {
  const status = health === 'online' ? 'BACKEND ONLINE' : health === 'checking' ? 'CHECKING BACKEND' : 'BACKEND UNAVAILABLE';
  return (
    <footer className={`site-footer ${overview ? 'overview-footer' : ''}`}>
      <span>◉ EdgePilot AI / intelligent placement control plane</span>
      <span>
        <i className={`footer-dot ${health}`} aria-hidden="true" />
        {status} · {overview ? 'V0.9.0' : 'v1.0.0'}
      </span>
    </footer>
  );
}

function App() {
  const [path, setPath] = useState(() => {
    const currentPath = window.location.pathname;
    return ROUTES.some(([route]) => route === currentPath) ? currentPath : '/';
  });
  const [mockMode, setMockMode] = useState(false);
  const [health, setHealth] = useState('checking');
  const [workload, setWorkload] = useState(INITIAL_WORKLOAD);
  const [resultData, setResultData] = useState(null);
  const [reportWorkload, setReportWorkload] = useState(null);
  const [simulationData, setSimulationData] = useState(null);
  const [resultSource, setResultSource] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  const [clickRipples, setClickRipples] = useState([]);
  const rippleId = useRef(0);

  function createClickRipple(event, keyboardActivation = false) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(
      'button, a, input, select, textarea, summary, [role="button"], [role="link"]',
    );
    if (!control || control.matches(':disabled')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const bounds = control.getBoundingClientRect();
    const id = rippleId.current++;
    setClickRipples((current) => [
      ...current,
      {
        id,
        x: keyboardActivation ? bounds.left + bounds.width / 2 : event.clientX,
        y: keyboardActivation ? bounds.top + bounds.height / 2 : event.clientY,
      },
    ]);
  }

  useEffect(() => {
    if (!ROUTES.some(([route]) => route === window.location.pathname)) {
      window.history.replaceState({}, '', '/');
    }

    function handlePopState() {
      const nextPath = window.location.pathname;
      const validPath = ROUTES.some(([route]) => route === nextPath);
      if (!validPath) window.history.replaceState({}, '', '/');
      setPath(validPath ? nextPath : '/');
      if (activeLenis) {
        activeLenis.scrollTo(0, { immediate: true });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (path !== '/') return undefined;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis = null;
    let gsapInstance = null;
    let ScrollTriggerPlugin = null;
    const updateScroll = () => ScrollTriggerPlugin?.update();
    const tick = (time) => lenis?.raf(time * 1000);
    const stop = () => {
      if (!lenis) return;
      lenis.off('scroll', updateScroll);
      gsapInstance.ticker.remove(tick);
      lenis.destroy();
      if (activeLenis === lenis) activeLenis = null;
      lenis = null;
    };
    let generation = 0;
    const start = async () => {
      if (motionPreference.matches || lenis) return;
      const currentGeneration = ++generation;
      const [lenisModule, gsapModule, scrollTriggerModule] = await Promise.all([
        import('lenis'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (currentGeneration !== generation || motionPreference.matches) return;
      const Lenis = lenisModule.default;
      gsapInstance = gsapModule.default;
      ScrollTriggerPlugin = scrollTriggerModule.ScrollTrigger;
      gsapInstance.registerPlugin(ScrollTriggerPlugin);
      lenis = new Lenis({ autoRaf: false, anchors: true });
      activeLenis = lenis;
      lenis.on('scroll', updateScroll);
      gsapInstance.ticker.add(tick);
      gsapInstance.ticker.lagSmoothing(0);
    };
    const syncMotionPreference = () => {
      if (motionPreference.matches) {
        generation += 1;
        stop();
      }
      else start();
    };

    start();
    motionPreference.addEventListener('change', syncMotionPreference);
    return () => {
      motionPreference.removeEventListener('change', syncMotionPreference);
      generation += 1;
      stop();
    };
  }, [path]);

  useLayoutEffect(() => {
    document.querySelectorAll('.app-shell main h1, .app-shell main h2, .app-shell main h3').forEach((heading) => {
      if (heading.classList.contains('dot-grid-title')) return;
      heading.querySelector('.heading-grid-overlay')?.remove();
      const overlay = document.createElement('span');
      overlay.className = 'heading-grid-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.textContent = heading.innerText.trim();
      heading.append(overlay);
    });
  }, [path, resultData]);

  useEffect(() => {
    if (path !== '/') return undefined;
    const overview = document.querySelector('.overview-page');
    if (!overview) return undefined;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let context = null;
    let generation = 0;
    const clear = () => {
      generation += 1;
      context?.revert();
      context = null;
      overview.style.removeProperty('--story-progress');
    };
    const animate = async () => {
      if (motionPreference.matches || context) return;
      const currentGeneration = ++generation;
      const [gsapModule, scrollTriggerModule] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (currentGeneration !== generation || motionPreference.matches) return;
      const gsap = gsapModule.default;
      const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        const transitions = [
          { section: '.deployment-section', outgoing: '.overview-hero', incoming: '.deployment-visual' },
          { section: '.signals-section', outgoing: '.deployment-visual', incoming: '.signal-graph-wrap' },
          { section: '.placement-loop', outgoing: '.signal-graph-wrap', incoming: '.loop-diagram' },
        ];

        transitions.forEach(({ section, outgoing, incoming }) => {
          const trigger = overview.querySelector(section);
          const from = overview.querySelector(outgoing);
          const to = overview.querySelector(incoming);
          if (!trigger || !from || !to) return;

          gsap.fromTo(
            from,
            { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)' },
            {
              autoAlpha: 0.38,
              y: -28,
              scale: 0.97,
              filter: 'blur(5px)',
              ease: 'none',
              scrollTrigger: {
                trigger,
                start: 'top 92%',
                end: 'top 30%',
                scrub: 0.8,
              },
            },
          );
          gsap.fromTo(
            to,
            { autoAlpha: 0.58, y: 34, scale: 0.97, filter: 'blur(5px)' },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              filter: 'blur(0px)',
              ease: 'none',
              scrollTrigger: {
                trigger,
                start: 'top 92%',
                end: 'top 30%',
                scrub: 0.8,
              },
            },
          );
        });
        ScrollTrigger.create({
          trigger: overview,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => overview.style.setProperty('--story-progress', self.progress),
        });
      }, overview);
      ScrollTrigger.refresh();
    };
    const syncMotionPreference = () => {
      if (motionPreference.matches) clear();
      else animate();
    };

    animate();
    motionPreference.addEventListener('change', syncMotionPreference);
    return () => {
      motionPreference.removeEventListener('change', syncMotionPreference);
      clear();
    };
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();
    checkBackendHealth(controller.signal)
      .then(() => setHealth('online'))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setHealth('offline');
      });
    return () => controller.abort();
  }, []);

  async function analyze(request) {
    setAnalyzing(true);
    setError('');
    setResultData(null);
    setReportWorkload(null);
    setSimulationData(null);
    setResultSource(null);
    try {
      if (mockMode) {
        setResultData(MOCK_RECOMMENDATION);
        setResultSource('mock');
      } else {
        const responseData = await getRecommendation(request);
        setResultData(responseData);
        setReportWorkload(request);
        setSimulationData(null);
        setResultSource('live');
      }
      navigateTo('/results', setPath);
    } catch (requestError) {
      const detail =
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'The request failed.';
      setError(
        `Unable to reach the recommendation service. ${detail} Check the backend/tunnel and CORS configuration, or enable mock mode for a labeled demo.`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function simulate(changes) {
    if (!reportWorkload || mockMode) return;
    setSimulating(true);
    setError('');
    setSimulationData(null);
    try {
      const responseData = await simulateWorkload(reportWorkload, changes);
      setSimulationData(responseData);
    } catch (requestError) {
      const detail =
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'The scenario request failed.';
      setError(`Unable to simulate this workload. ${detail}`);
    } finally {
      setSimulating(false);
    }
  }

  async function downloadReport(workload) {
    setReporting(true);
    setError('');
    try {
      const blob = await getRecommendationReport(workload);
      if (blob.size === 0) throw new Error('The report service returned an empty PDF.');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'EdgePilot_Recommendation_Report.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      const detail =
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'The PDF could not be downloaded.';
      setError(
        `Unable to prepare the recommendation PDF. ${detail} Check the backend/tunnel and CORS configuration.`,
      );
    } finally {
      setReporting(false);
    }
  }

  let page;
  if (path === '/analyzer') {
    page = (
      <Analyzer
        workload={workload}
        setWorkload={setWorkload}
        onAnalyze={analyze}
        busy={analyzing}
      />
    );
  } else if (path === '/results') {
    page = (
      <Results
        resultData={resultData}
        resultSource={resultSource}
        reportWorkload={reportWorkload}
        simulationData={simulationData}
        simulating={simulating}
        onSimulate={simulate}
        onScenarioChange={() => setSimulationData(null)}
        setPath={setPath}
        onReport={downloadReport}
        reporting={reporting}
      />
    );
  } else {
    page = <Overview setPath={setPath} />;
  }

  return (
    <div
      className="app-shell"
      onPointerDownCapture={(event) => createClickRipple(event)}
      onClickCapture={(event) => {
        if (event.detail === 0) createClickRipple(event, true);
      }}
    >
      <Header
        path={path}
        setPath={setPath}
        mockMode={mockMode}
        setMockMode={setMockMode}
        health={health}
      />
      {mockMode && <DemoNotice />}
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {page}
      <Footer health={health} overview={path === '/'} />
      <div className="click-ripple-layer" aria-hidden="true">
        {clickRipples.map((ripple) => (
          <span
            className="click-ripple"
            key={ripple.id}
            style={{ left: ripple.x, top: ripple.y }}
            onAnimationEnd={() =>
              setClickRipples((current) => current.filter((item) => item.id !== ripple.id))
            }
          />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
