import {
  workflow,
  trigger,
  node,
  sticky,
  expr,
  newCredential,
} from '@n8n/workflow-sdk';

const composeWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Compose Pack Webhook',
    position: [240, 360],
    parameters: {
      httpMethod: 'POST',
      path: 'compose-application-pack',
      responseMode: 'responseNode',
      options: {},
    },
  },
  output: [
    {
      headers: {},
      params: {},
      query: {},
      body: {
        job_id: 'li_1234567890',
        company: 'Acme Corp',
        role: 'Product Manager',
        jd: 'Looking for a Product Manager with Agile, SQL, and stakeholder skills.',
        status: 'Ready to Apply',
      },
      webhookUrl: 'https://n8n.fineanmol.dev/webhook/compose-application-pack',
      executionMode: 'production',
    },
  ],
});

const normalizeInput = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Input',
    position: [480, 360],
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          {
            id: 'job_id',
            name: 'job_id',
            value: expr(
              '{{ $json.body?.job_id ?? $json.job_id ?? "" }}',
            ),
            type: 'string',
          },
          {
            id: 'company',
            name: 'company',
            value: expr(
              '{{ $json.body?.company ?? $json.company ?? "" }}',
            ),
            type: 'string',
          },
          {
            id: 'role',
            name: 'role',
            value: expr(
              '{{ $json.body?.role ?? $json.body?.position ?? $json.role ?? "" }}',
            ),
            type: 'string',
          },
          {
            id: 'jd',
            name: 'jd',
            value: expr(
              '{{ $json.body?.jd ?? $json.body?.job_description ?? $json.body?.jobDescription ?? $json.jd ?? "" }}',
            ),
            type: 'string',
          },
          {
            id: 'status',
            name: 'status',
            value: expr(
              '{{ $json.body?.status ?? $json.status ?? "Ready to Apply" }}',
            ),
            type: 'string',
          },
          {
            id: 'sheet_row',
            name: 'sheet_row',
            value: expr(
              '{{ $json.body?.sheet_row ?? $json.sheet_row ?? "" }}',
            ),
            type: 'string',
          },
          {
            id: 'compose_api_url',
            name: 'compose_api_url',
            value: 'http://host.docker.internal:8792/v1/compose_pack',
            type: 'string',
          },
        ],
      },
      includeOtherFields: false,
      options: {},
    },
  },
  output: [
    {
      job_id: 'li_1234567890',
      company: 'Acme Corp',
      role: 'Product Manager',
      jd: 'Looking for a Product Manager with Agile, SQL, and stakeholder skills.',
      status: 'Ready to Apply',
      sheet_row: '',
      compose_api_url: 'http://host.docker.internal:8792/v1/compose_pack',
    },
  ],
});

const hasRequiredFields = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Has Required Fields',
    position: [720, 360],
    parameters: {
      conditions: {
        combinator: 'and',
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: 'c1',
            leftValue: expr('{{ $json.job_id }}'),
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty' },
          },
          {
            id: 'c2',
            leftValue: expr('{{ $json.company }}'),
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty' },
          },
          {
            id: 'c3',
            leftValue: expr('{{ $json.role }}'),
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty' },
          },
          {
            id: 'c4',
            leftValue: expr('{{ $json.jd }}'),
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty' },
          },
        ],
      },
      looseTypeValidation: false,
      options: {},
    },
  },
  output: [
    [
      {
        job_id: 'li_1234567890',
        company: 'Acme Corp',
        role: 'Product Manager',
        jd: 'Looking for a Product Manager with Agile, SQL, and stakeholder skills.',
        status: 'Ready to Apply',
        sheet_row: '',
        compose_api_url: 'http://host.docker.internal:8792/v1/compose_pack',
      },
    ],
    [],
  ],
});

const respondMissing = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Missing Fields',
    position: [960, 560],
    parameters: {
      respondWith: 'json',
      responseBody:
        '{\n  "ok": false,\n  "error": "Missing required fields: job_id, company, role, jd"\n}',
      options: {
        responseCode: 400,
      },
    },
  },
});

const callComposePack = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Call Compose Pack Service',
    position: [960, 280],
    parameters: {
      method: 'POST',
      url: expr('{{ $json.compose_api_url }}'),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'User-Agent', value: 'n8n-compose-application-pack' },
        ],
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(
        '{{ JSON.stringify({ job_id: $json.job_id, company: $json.company, role: $json.role, jd: $json.jd, status: $json.status, sheet_row: $json.sheet_row || undefined }) }}',
      ),
      options: {
        timeout: 600000,
        response: {
          response: {
            fullResponse: true,
            neverError: true,
          },
        },
      },
    },
    credentials: {
      httpHeaderAuth: newCredential('Compose Pack API'),
    },
  },
  output: [
    {
      statusCode: 200,
      headers: {},
      body: {
        ok: true,
        jobId: 'li_1234567890',
        company: 'Acme Corp',
        role: 'Product Manager',
        ats_score: 96,
        resumeUrl:
          'https://pub-47bf039641094cef9259459eeb1367d4.r2.dev/job-apps/li_1234567890/resume_Acme_Corp.pdf',
        coverLetterUrl:
          'https://pub-47bf039641094cef9259459eeb1367d4.r2.dev/job-apps/li_1234567890/Cover_Letter_Acme_Corp.pdf',
        layout: 'designer-locked',
        status: 'Ready to Apply',
      },
    },
  ],
});

const composeSucceeded = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: {
    name: 'Compose Succeeded',
    position: [1200, 280],
    parameters: {
      conditions: {
        combinator: 'and',
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose',
          version: 2,
        },
        conditions: [
          {
            id: 'ok1',
            leftValue: expr('{{ $json.statusCode }}'),
            rightValue: 200,
            operator: { type: 'number', operation: 'equals' },
          },
          {
            id: 'ok2',
            leftValue: expr('{{ $json.body?.ok }}'),
            rightValue: true,
            operator: { type: 'boolean', operation: 'true' },
          },
        ],
      },
      looseTypeValidation: true,
      options: {},
    },
  },
  output: [
    [
      {
        statusCode: 200,
        body: {
          ok: true,
          jobId: 'li_1234567890',
          ats_score: 96,
          resumeUrl: 'https://example.com/r.pdf',
          coverLetterUrl: 'https://example.com/c.pdf',
          layout: 'designer-locked',
        },
      },
    ],
    [
      {
        statusCode: 500,
        body: { ok: false, error: 'ATS boost failed' },
      },
    ],
  ],
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Success',
    position: [1440, 180],
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.body }}'),
      options: {
        responseCode: 200,
      },
    },
  },
});

const respondFailure = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Failure',
    position: [1440, 400],
    parameters: {
      respondWith: 'json',
      responseBody: expr(
        '{{ $json.body || { ok: false, error: "Compose pack service failed", statusCode: $json.statusCode } }}',
      ),
      options: {
        responseCode: 502,
      },
    },
  },
});

const guide = sticky(
  '## Compose Application Pack\n\nStandard JD → ATS≥90 resume + cover letter.\n\n**Layout stays locked** — n8n never rebuilds PDFs. It calls the local compose-pack HTTP service which uses resume-cv-mvp designer export.\n\n### Setup\n1. Start resume API (`:8791`)\n2. `npm run compose-pack-http` (`:8792`)\n3. Create credential **Compose Pack API** (Header Auth): name `X-Compose-Pack-Token`, value = `COMPOSE_PACK_TOKEN` from `.env`\n4. If n8n is on a remote VPS, set `compose_api_url` in **Normalize Input** to a tunnel URL to your Mac `:8792`\n\n### Request\n`POST /webhook/compose-application-pack`\n```json\n{\n  "job_id": "li_123",\n  "company": "Acme",\n  "role": "Product Manager",\n  "jd": "full job description..."\n}\n```',
  [composeWebhook, normalizeInput, hasRequiredFields],
  { color: 4, position: [200, 40] },
);

export default workflow(
  'compose-application-pack',
  'Compose Application Pack (JD → Resume+CL)',
)
  .add(guide)
  .add(composeWebhook)
  .to(normalizeInput)
  .to(
    hasRequiredFields
      .onTrue(
        callComposePack.to(
          composeSucceeded
            .onTrue(respondSuccess)
            .onFalse(respondFailure),
        ),
      )
      .onFalse(respondMissing),
  );
