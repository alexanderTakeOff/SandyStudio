import { checkVerbalApproval } from './lib/concierge/approval-check';
const t = (input: string) => {
  const r = checkVerbalApproval([
    { id: 't', thread_id: 'x', role: 'director', event_type: 'message', content: input, metadata: {}, token_count: null, created_at: '2026-05-11' },
  ]);
  console.log(`${r.approved ? '✓' : '✗'}  ${JSON.stringify(input).padEnd(25)} → ${r.approved ? 'APPROVED' : 'rejected'}`);
};
t('одобряю');
t('одобряю!');
t('да');
t('НУ ДАВАЙ');
t('давай поехали');
t('Поехали!');
t('yes');
t('approve');
t('OK GO');
t('не надо');
t('нет');
t('может быть');
t('подожди');
t('что у нас сегодня');
