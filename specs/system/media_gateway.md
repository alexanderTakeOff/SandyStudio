# SandyStudio — Media Service Gateway Spec
## specs/system/media_gateway.md | v0.1 | DRAFT

> Defines how the Media Service Gateway routes, validates, retries, and logs
> every media generation call. This is the single choke-point between agents
> and all external services. No agent reaches a provider directly.
>
> Contract definitions: `specs/system/api_integrations.md`
> Provider registry:    `config/providers.yaml`

---

## 1. PURPOSE

The Media Service Gateway is the abstraction layer that:

1. **Routes** each contract call to the correct provider per `providers.yaml`
2. **Validates** requests against contracts before any API call is made
3. **Enforces budget gates** — blocks calls that would exceed episode ceiling
4. **Monitors health** — routes away from degraded/down providers automatically
5. **Retries** failed calls according to retry policy before declaring failure
6. **Normalises** all provider responses into the standard BaseProviderResponse format
7. **Logs** every call: cost, provider used, outcome — to PLAN.md budget tracker and audit log

---

## 2. GATEWAY CALL LIFECYCLE

Every media generation call follows this exact sequence:

```
AGENT calls gateway.generate_*(request)
        │
        ├─ [1] INPUT VALIDATION
        │       Validate all required fields present
        │       Validate field values within allowed ranges
        │       → FAIL: return E-INPUT-001/002, no API call made
        │
        ├─ [2] BUDGET GATE CHECK
        │       Load current episode spend from PLAN.md budget tracker
        │       Check: current_spend + estimated_cost_usd ≤ episode_ceiling
        │       Check: estimated_cost_usd ≤ hard_block_above_usd
        │       → FAIL: return E-BUDGET-001/002, no API call made
        │       → WARN: if remaining < 20% of ceiling, add budget_warning flag to response
        │
        ├─ [3] PROVIDER SELECTION
        │       Read contract_type → look up provider in providers.yaml
        │       Check primary provider health (cache: 60s TTL)
        │       → Primary HEALTHY: select primary
        │       → Primary DEGRADED: select primary, set retry_on_fail = true
        │       → Primary DOWN: select fallback (if allow_fallback = true)
        │       → All DOWN: return E-HEALTH-001, queue request if queue_on_failure = true
        │
        ├─ [4] CREDENTIAL CHECK
        │       Confirm required environment variable(s) for selected provider exist
        │       → MISSING: return E-CONFIG-002, do not fall through to API call
        │
        ├─ [5] API CALL (primary or fallback)
        │       Submit request to provider adapter
        │       Adapter translates BaseProviderRequest → provider-native format
        │       For ASYNC providers: poll at poll_interval_seconds until complete or timeout
        │
        ├─ [6] RESPONSE NORMALISATION
        │       Adapter translates provider-native response → BaseProviderResponse
        │       Populate all base fields: provider_used, latency_ms, cost_usd, etc.
        │       Run output validation: file exists, format correct, size > 0
        │
        ├─ [7] RETRY (if applicable)
        │       On transient failure (E-RATE-001, E-TIMEOUT-001, E-SERVER-001):
        │         → Wait retry_after_seconds (or default backoff)
        │         → Retry same provider once
        │         → If retry fails and allow_fallback = true: switch to fallback
        │         → If retry fails and no fallback: return FAILED status
        │       On hard failure (E-AUTH-*, E-CONTENT-*, E-BUDGET-*):
        │         → No retry; return immediately
        │
        ├─ [8] COST LOGGING
        │       Append entry to PLAN.md ## Budget Tracker
        │       Format: | datetime | episode_id | shot_id | provider | call_type | cost_usd |
        │       Update: episode running total
        │       If episode_total > 80% ceiling: set at_risk = true in PLAN.md
        │       If episode_total >= ceiling: set blocked = true, notify Director
        │
        └─ [9] RETURN RESPONSE
                Return normalised BaseProviderResponse to agent
                Agent reads status field first:
                  SUCCESS  → proceed with output file
                  PARTIAL  → review output, may still be usable
                  FAILED   → trigger QA retry protocol
                  BUDGET_BLOCKED → escalate to Director immediately
                  RATE_LIMITED   → EXEC-ORCH queues and retries after retry_after_seconds
```

---

## 3. ROUTING POLICY

Read from `config/providers.yaml`. Gateway applies these rules in order:

```yaml
routing_rules:
  # Rule 1: respect provider_hint if provider is healthy
  - condition: request.provider_hint != null AND provider[hint].health == HEALTHY
    action: USE provider[hint]

  # Rule 2: use primary if healthy
  - condition: primary.health == HEALTHY
    action: USE primary

  # Rule 3: use primary if degraded (with retry armed)
  - condition: primary.health == DEGRADED
    action: USE primary, arm_retry = true

  # Rule 4: use fallback if primary is down and fallback allowed
  - condition: primary.health == DOWN AND request.allow_fallback == true AND fallback != null
    action: USE fallback, log_primary_failure = true

  # Rule 5: use fallback if primary is down and fallback allowed (secondary fallback)
  - condition: primary.health == DOWN AND fallback.health == DOWN AND tertiary != null
    action: USE tertiary, log_multi_failure = true

  # Rule 6: all providers down or fallback not allowed
  - condition: ALL DOWN OR request.allow_fallback == false
    action: RETURN E-HEALTH-001
             IF providers.yaml.queue_on_failure == true: QUEUE request for 15 min retry
             ELSE: return FAILED to agent immediately
```

---

## 4. HEALTH MONITORING

The gateway maintains a lightweight health model for each provider.

### Health Check Triggers

```yaml
health_check_triggers:
  - On every gateway call: read cached health status
  - If cache TTL expired (60 seconds): run passive health check
  - On 3 consecutive failures from a provider: run active health check
  - On E-SERVER-001/002: immediately mark DEGRADED; schedule recheck in 5 min
  - On E-AUTH-001/002: immediately mark DOWN; notify Director; do not auto-recover
```

### Health States

```yaml
health_states:
  HEALTHY:
    definition: Last 5 calls all succeeded; p95 latency within normal range
    action: Route normally

  DEGRADED:
    definition: >1 failure in last 5 calls OR latency >2x normal p95
    action: Route to this provider but arm retry; watch closely
    auto_recover_to: HEALTHY after 10 consecutive successes

  DOWN:
    definition: >3 consecutive failures OR provider returned 5xx on health probe
    action: Route to fallback; log to PLAN.md; notify Director if no fallback
    auto_recover_to: DEGRADED after 1 success on scheduled recheck
    recheck_interval_minutes: 10

  UNKNOWN:
    definition: No data yet (new provider or long gap in calls)
    action: Treat as HEALTHY; arm retry on first call
```

### Health Log Format (written to `reviews/` folder)

```
SS-[DATE]-REV-gateway_health_log-v01-DRAFT.md
Each entry: | datetime | provider | health_state | trigger | notes |
```

---

## 5. BUDGET GATE LOGIC

```yaml
budget_gate:
  # Pre-call checks (Step 2 in lifecycle)
  check_1_episode_ceiling:
    condition: current_spend + estimated_cost_usd > episode_ceiling_usd
    action: BLOCK — return E-BUDGET-001
            Write BLOCKED entry to PLAN.md
            Notify EXEC-ORCH to escalate to Director

  check_2_single_call_hard_limit:
    condition: estimated_cost_usd > hard_block_above_usd
    action: BLOCK — return E-BUDGET-002
            Director must set budget_override = true in PLAN.md to proceed

  check_3_warning_threshold:
    condition: (current_spend + estimated_cost_usd) / episode_ceiling_usd > 0.80
    action: ALLOW but add budget_warning = true to response
            Log WARNING to PLAN.md
            EXEC-ORCH notifies Director at next opportunity (not blocking)

  # Post-call update (Step 8 in lifecycle)
  update:
    - Add actual cost_usd to episode running total
    - If running_total > episode_ceiling_usd: set episode.budget_status = EXCEEDED in PLAN.md
    - BOARD-FIN receives full cost breakdown in end-of-episode report
```

---

## 6. RETRY POLICY

```yaml
retry_policy:
  # Retryable errors
  retryable:
    E-RATE-001:
      wait_seconds: 60
      max_retries: 1
      switch_provider_after: 1   # switch to fallback after 1 failed retry
    E-RATE-002:
      wait_seconds: 300          # 5 min — daily limit; longer wait
      max_retries: 1
      switch_provider_after: 0   # switch immediately (different provider may have quota)
    E-TIMEOUT-001:
      wait_seconds: 30
      max_retries: 1
      switch_provider_after: 1
    E-TIMEOUT-002:
      wait_seconds: 60
      max_retries: 1
      switch_provider_after: 1
    E-SERVER-001:
      wait_seconds: 30
      max_retries: 2
      switch_provider_after: 2
    E-SERVER-002:
      wait_seconds: 600          # 10 min — maintenance; long wait
      max_retries: 1
      switch_provider_after: 0   # switch immediately during maintenance

  # Non-retryable errors (fail immediately)
  non_retryable:
    - E-AUTH-001     # key is wrong — retrying won't help; fix the key
    - E-AUTH-002     # plan insufficient — retrying won't help
    - E-CONTENT-001  # prompt was refused — agent must revise prompt
    - E-CONTENT-002  # output flagged — route through QA, do not auto-retry
    - E-BUDGET-001   # budget blocked — Director decision required
    - E-BUDGET-002   # hard limit — Director decision required
    - E-INPUT-001    # bad request — agent must fix the request
    - E-INPUT-002    # bad request — agent must fix the request
    - E-CONFIG-001   # misconfiguration — human must fix providers.yaml
    - E-CONFIG-002   # missing env var — human must set the variable
```

---

## 7. AUDIT LOG

Every gateway call — success or failure — produces one audit entry.
Written to: `C:\SandyStudio\reviews\gateway_audit\` (one file per episode).

```yaml
AuditEntry:
  timestamp: datetime
  request_id: uuid
  episode_id: string
  shot_id: string | null
  agent_id: string
  contract_type: ImageProvider | VideoProvider | CharacterVideoProvider |
                 MusicProvider | SFXProvider | VoiceProvider | UpscaleProvider
  provider_selected: string
  provider_health_at_call: HEALTHY | DEGRADED | DOWN | UNKNOWN
  fallback_used: boolean
  status: SUCCESS | PARTIAL | FAILED | RATE_LIMITED | BUDGET_BLOCKED | TIMEOUT
  error_code: string | null
  retry_count: integer
  cost_usd: number
  latency_ms: integer
  output_file: path | null
  budget_remaining_after_usd: number
```

---

## 8. PROVIDER SWITCHING PROCEDURE

When Director decides to swap a provider (e.g., move from Flux Pro to Ideogram):

```
1. Director updates config/providers.yaml:
      image.primary: ideogram    (was: flux-pro)

2. Director confirms new provider's env variable is set in Windows environment

3. EXEC-ARCH logs the change in PLAN.md Change Log

4. Gateway picks up new provider on next call (no restart required — reads config fresh)

5. First 3 calls with new provider: gateway adds provider_switched_recently = true
   to response; EXEC-VGEN flags these for QA review regardless of quality score

6. If new provider produces lower quality: Director can revert providers.yaml instantly
   Existing generated files are unaffected (they log which provider produced them)

7. Any prompts generated under old provider retain old provider_used in their audit entry
   (enables post-hoc comparison and version tracing)
```

---

## 9. AGENT CALL REFERENCE

How agents invoke the gateway. These are the only method signatures agents use.

```python
# All agents call these — never a specific service
gateway.generate_image(ImageProviderRequest)         → ImageProviderResponse
gateway.generate_video(VideoProviderRequest)          → VideoProviderResponse
gateway.generate_character_video(CharacterVideoProviderRequest) → CharacterVideoProviderResponse
gateway.generate_music(MusicProviderRequest)          → MusicProviderResponse
gateway.generate_sfx(SFXProviderRequest)              → SFXProviderResponse
gateway.generate_voice(VoiceProviderRequest)          → VoiceProviderResponse      # FUTURE
gateway.upscale(UpscaleProviderRequest)               → UpscaleProviderResponse    # FUTURE

# Gateway management (EXEC-ORCH only)
gateway.check_provider_health(contract_type: string)  → HealthStatus
gateway.get_budget_status(episode_id: string)         → BudgetStatus
gateway.get_generation_log(episode_id: string)        → AuditEntry[]
gateway.reload_provider_config()                      → void  # after providers.yaml change
```

---

## 10. ADDING A NEW PROVIDER

Steps to wire in any new service (e.g., a new video model releases):

```
1. Write adapter: implements the relevant contract interface
   File: agents/exec/adapters/[provider_name]_adapter.md (spec) or .py (code)

2. Add to providers.yaml under the appropriate contract slot:
     video.providers.[provider_name]:
       env_key: PROVIDER_NAME_API_KEY
       adapter: provider_name_adapter
       base_url: https://api.provider.com/v1
       async_mode: true
       poll_interval_seconds: 10
       max_wait_seconds: 300

3. Set environment variable with API key

4. Set as tertiary or fallback first — run 10 test calls before promoting to primary

5. Log addition in PLAN.md Change Log

6. Notify BOARD-FIN — new cost model to track
```

---

*SandyStudio media_gateway.md | v0.1 | Status: DRAFT*
*Created: 2026-04-24 — provider abstraction layer, contract routing, budget gate, health monitoring*
