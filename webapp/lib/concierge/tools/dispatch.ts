// ──────────────────────────────────────────────────────────────────────────────
// lib/concierge/tools/dispatch.ts
// Mutating tools — wrap the existing webapp API routes with verbal-approval
// gating so the Prod Assistant can act on the Director's behalf in Mode 2.5
// without bypassing the governance + audit infrastructure that the real UI
// uses. Every call forwards the Director's session cookies so requireDirector()
// upstream attributes the action to the real human.
// ──────────────────────────────────────────────────────────────────────────────

import { checkVerbalApproval } from '../approval-check';
import { fail, ok, type Tool, type ToolContext, type ToolResult } from './types';

type AnyArgs = Record<string, unknown>;

interface TriggerAgentArgs {
  episodeId?: string;
  agentCode: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export const triggerAgent: Tool<TriggerAgentArgs> = {
  name: 'triggerAgent',
  description:
    "Manually trigger an EXEC-* agent for an episode. Use this when a stage is idle or you need to restart a failed step. Requires verbal approval from the Director in the conversation (look for 'да', 'одобряю', 'go', 'yes'). Allowed agents: EXEC-SW, EXEC-SREV, EXEC-SB, EXEC-WCHK, EXEC-EREF, EXEC-EDIT, EXEC-VGEN, EXEC-MGEN, EXEC-STITCH, EXEC-COPY, EXEC-THUMB, EXEC-PUB (Director-only), EXEC-ANAL.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'triggerAgent',
      description: "Fire an Inngest event for an EXEC-* agent. Verbal approval required.",
      parameters: {
        type: 'object',
        properties: {
          episodeId: {
            type: 'string',
            description: 'Episode UUID. Omit to use active conversation episode.',
          },
          agentCode: {
            type: 'string',
            description: 'Agent identifier, e.g. EXEC-SW.',
            enum: [
              'EXEC-SW', 'EXEC-SREV', 'EXEC-SB', 'EXEC-WCHK', 'EXEC-EREF',
              'EXEC-EREF-DESIGNER', 'EXEC-EPREV',
              'EXEC-EDIT', 'EXEC-VGEN', 'EXEC-VANIM', 'EXEC-VPREV',
              'EXEC-GAGAD',
              'EXEC-MGEN', 'EXEC-STITCH',
              'EXEC-COPY', 'EXEC-THUMB', 'EXEC-PUB', 'EXEC-ANAL',
            ],
          },
          reason: {
            type: 'string',
            description: 'Short audit-log reason — paraphrase Director\'s spoken intent.',
            minLength: 3,
          },
          payload: {
            type: 'object',
            description: 'Optional agent-specific payload override.',
            additionalProperties: true,
          },
        },
        required: ['agentCode', 'reason'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const episodeId = typeof obj.episodeId === 'string' ? obj.episodeId : undefined;
    const agentCode = typeof obj.agentCode === 'string' ? obj.agentCode : '';
    const reason = typeof obj.reason === 'string' ? obj.reason : '';
    const payload =
      obj.payload && typeof obj.payload === 'object'
        ? (obj.payload as Record<string, unknown>)
        : undefined;
    if (!agentCode) throw new Error('agentCode is required');
    if (!reason || reason.trim().length < 3) {
      throw new Error('reason is required (min 3 chars)');
    }
    return { episodeId, agentCode, reason: reason.trim(), payload };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const episodeId = args.episodeId ?? ctx.episodeId;
    if (!episodeId) {
      return fail(
        'episodeId required — no active episode in conversation context.',
      );
    }
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const resp = await internalFetch(
      ctx,
      `/api/episodes/${encodeURIComponent(episodeId)}/trigger`,
      {
        agentCode: args.agentCode,
        reason: `[Prod Assistant] ${args.reason} — ${approval.reason}`,
        payload: args.payload,
      },
    );
    return parseFetchResponse(resp, `triggerAgent(${args.agentCode})`);
  },
};

interface ApproveAssetArgs {
  assetId: string;
  decision?: 'APPROVE' | 'REQUEST_REVISION' | 'REJECT';
  note?: string;
}

export const approveAsset: Tool<ApproveAssetArgs> = {
  name: 'approveAsset',
  description:
    "Approve, request revision, or reject an asset on behalf of the Director. Requires verbal approval in the conversation. Decision defaults to APPROVE. For visual assets (IMG/VID), this forwards `preview_acknowledged=true` since the Director's verbal 'yes' implies they understood what they approved.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'approveAsset',
      description: 'Approve / request revision / reject an asset. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Asset UUID.' },
          decision: {
            type: 'string',
            enum: ['APPROVE', 'REQUEST_REVISION', 'REJECT'],
            description: 'Defaults to APPROVE.',
          },
          note: {
            type: 'string',
            description: 'Director\'s spoken reasoning, paraphrased.',
            maxLength: 2000,
          },
        },
        required: ['assetId'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const assetId = typeof obj.assetId === 'string' ? obj.assetId : '';
    if (!assetId) throw new Error('assetId is required');
    const decision =
      obj.decision === 'REQUEST_REVISION' || obj.decision === 'REJECT'
        ? obj.decision
        : 'APPROVE';
    return {
      assetId,
      decision,
      note: typeof obj.note === 'string' ? obj.note : undefined,
    };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }

    const body: Record<string, unknown> = {
      decision: args.decision ?? 'APPROVE',
      note: args.note
        ? `[Prod Assistant] ${args.note} — ${approval.reason}`
        : `[Prod Assistant] ${approval.reason}`,
      // Verbal approval implies the Director consented to what was shown.
      preview_acknowledged: true,
      directorConfirm: true,
    };

    const resp = await internalFetch(
      ctx,
      `/api/assets/${encodeURIComponent(args.assetId)}/approve`,
      body,
    );
    return parseFetchResponse(resp, `approveAsset(${args.assetId})`);
  },
};

interface RequestRevisionArgs {
  assetId: string;
  note: string;
}

export const requestRevision: Tool<RequestRevisionArgs> = {
  name: 'requestRevision',
  description:
    "Send an asset back for revision (status → REVISION) with a note explaining what the agent should fix. Non-destructive — keeps the asset around but blocks the downstream cascade until a fresh APPROVE. The note is sent to the producing agent so it can re-run with better input. Verbal approval required since this restarts work.",
  mutating: true,
  schema: {
    type: 'function',
    function: {
      name: 'requestRevision',
      description: 'Send an asset back for revision with feedback. Verbal approval required.',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Asset UUID.' },
          note: {
            type: 'string',
            description: 'Specific feedback for the producing agent. Quote the Director\'s actual concern.',
            minLength: 3,
            maxLength: 2000,
          },
        },
        required: ['assetId', 'note'],
        additionalProperties: false,
      },
    },
  },
  parse(raw) {
    const obj = safeParse(raw);
    const assetId = typeof obj.assetId === 'string' ? obj.assetId : '';
    const note = typeof obj.note === 'string' ? obj.note.trim() : '';
    if (!assetId) throw new Error('assetId is required');
    if (note.length < 3) throw new Error('note is required (min 3 chars)');
    return { assetId, note };
  },
  async execute(args, ctx): Promise<ToolResult> {
    const approval = checkVerbalApproval(ctx.recentTurns ?? []);
    if (!approval.approved) {
      return fail(approval.reason, 'verbal_approval_required');
    }
    const resp = await internalFetch(
      ctx,
      `/api/assets/${encodeURIComponent(args.assetId)}/approve`,
      {
        decision: 'REQUEST_REVISION',
        note: `[Prod Assistant] ${args.note} — ${approval.reason}`,
        directorConfirm: true,
        preview_acknowledged: true,
      },
    );
    return parseFetchResponse(resp, `requestRevision(${args.assetId})`);
  },
};

async function internalFetch(
  ctx: ToolContext,
  path: string,
  body: unknown,
): Promise<Response> {
  const url = `${ctx.appOrigin.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ctx.cookieHeader ? { Cookie: ctx.cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function parseFetchResponse(resp: Response, tag: string): Promise<ToolResult> {
  let bodyJson: unknown = null;
  try {
    bodyJson = await resp.json();
  } catch {
    /* fall through */
  }
  if (!resp.ok) {
    const message =
      bodyJson && typeof bodyJson === 'object' && 'error' in bodyJson
        ? String((bodyJson as { error: unknown }).error)
        : `${tag} failed with HTTP ${resp.status}`;
    return fail(message, `http_${resp.status}`);
  }
  return ok(bodyJson, `${tag} succeeded.`);
}

function safeParse(raw: string): AnyArgs {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AnyArgs;
    return {};
  } catch {
    return {};
  }
}
