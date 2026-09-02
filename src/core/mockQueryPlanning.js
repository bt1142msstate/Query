function buildDemoQueryPlan(payload = {}) {
  const enabled = payload.smart_query_enabled !== false;
  return {
    ok: true,
    data: {
      schema_version: 2,
      strategy: enabled ? 'cost_based_routes_v2' : 'manual_order_v2',
      changed: false,
      order: (payload.filters || []).map((filter, index) => ({
        field: filter.field,
        operator: filter.operator || '=',
        original_position: index + 1,
        planned_position: index + 1,
        reason: enabled ? 'Sample complete-route estimate' : 'Original order preserved'
      })),
      eta: {
        available: true,
        method: 'stage_cost_model_v2',
        confidence: 'low',
        sample_size: 0,
        requires_comparable_history: false,
        estimated_candidates: 120,
        expected_candidates: 120,
        expected_scanned_records: 400,
        expected_output_rows: 120,
        expected_output_bytes: 24000,
        p50_seconds: 1,
        p80_seconds: 3,
        p90_seconds: 5,
        lower_seconds: 1,
        upper_seconds: 3,
        basis: 'Sample private statistics and conservative hardware constants',
        stages: [{ id: 'selector_scan', label: 'Selector scan', p50_seconds: 1 }],
        warnings: [],
        label: 'Likely 1–3 seconds'
      },
      route: { selected: ['selitem'], alternatives_compared: 1 },
      aggregate_basis: { available: true, label: 'Current private collection aggregates' },
      explanation: enabled
        ? 'Smart ordering is on. The lowest-cost valid route runs first without changing query meaning.'
        : 'Smart ordering is off. Filters will run in the order shown.'
    }
  };
}

export { buildDemoQueryPlan };
