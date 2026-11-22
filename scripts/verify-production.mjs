import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

export function deploymentOutcome(deployments, sha) {
  return deployments.find(
    (deployment) =>
      deployment.sha === sha && deployment.environment === 'main - plannedwallet-pilot',
  );
}

export async function verifyProduction({ sha, api, fetchUrl, sleep, attempts = 90 }) {
  const root = 'repos/BrenoSerenMartins/PlannedWallet/deployments';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const deployments = await api(`${root}?per_page=100`);
    const deployment = deploymentOutcome(deployments, sha);
    const latest = deployments.find((item) => item.environment === 'main - plannedwallet-pilot');
    if (deployment && latest?.id !== deployment.id) {
      throw new Error('Outro commit substituiu o deploy solicitado no Render.');
    }
    if (deployment) {
      const statuses = await api(`${root}/${deployment.id}/statuses`);
      const status = statuses[0];
      if (['failure', 'error', 'inactive'].includes(status?.state)) {
        throw new Error('O Render recusou ou substituiu o deploy. Consulte o painel do serviço.');
      }
      if (status?.state === 'success') {
        for (const path of ['/health', '/ready']) {
          const response = await fetchUrl(`https://plannedwallet-pilot.onrender.com${path}`);
          if (response.status !== 200) throw new Error(`Produção indisponível em ${path}.`);
        }
        return;
      }
    }
    if (attempt + 1 < attempts) await sleep(10000);
  }
  throw new Error(
    'Prazo de 15 minutos excedido aguardando o commit no Render. Confira o auto-deploy e a autenticação do GitHub CLI.',
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const sha = process.argv[2];
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Informe o SHA completo publicado.');
  await verifyProduction({
    sha,
    api: async (path) =>
      JSON.parse(
        execFileSync('gh', ['api', path], {
          encoding: 'utf8',
          timeout: 30000,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ),
    fetchUrl: async (url) => ({
      status: Number(
        execFileSync(
          'curl',
          [
            '--silent',
            '--show-error',
            '--max-time',
            '30',
            '--output',
            '/dev/null',
            '--write-out',
            '%{http_code}',
            url,
          ],
          { encoding: 'utf8', timeout: 35000, stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      ),
    }),
    sleep: setTimeout,
  });
}
