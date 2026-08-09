import { sb } from './run/_env';
async function main(){
  const { data, error } = await sb.from('activity_events').insert({
    event_type: 'episode_settings_changed',
    severity: 'info',
    title: 'Ф4-тест: Директор сохранил настройки E05',
    description: 'проверка пробуждения: подтверди получение события ОДНОЙ строкой и ничего не делай',
    actor: 'DIRECTOR-TEST',
    episode_id: '8f053f75-e204-4f9f-b6c4-d3fbe9ade163',
    metadata: { probe: true },
  }).select('id').single();
  console.log('event:', data?.id, error?.message ?? 'ok');
}
main();
