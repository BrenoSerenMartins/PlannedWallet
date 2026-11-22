import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { devNull } from 'node:os';
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

export async function productionBaseline({ api, fetchUrl }) {
  const root = 'repos/BrenoSerenMartins/PlannedWallet/deployments';
  const deployments = await api(`${root}?per_page=100`);
  for (const deployment of deployments) {
    if (deployment.environment !== 'main - plannedwallet-pilot') continue;
    const statuses = await api(`${root}/${deployment.id}/statuses`);
    if (statuses[0]?.state !== 'success') continue;
    if (!/^[a-f0-9]{40}$/.test(deployment.sha)) throw new Error('SHA de produção inválido.');
    for (const path of ['/health', '/ready']) {
      if ((await fetchUrl(`https://plannedwallet-pilot.onrender.com${path}`)).status !== 200)
        throw new Error(
          'A versão publicada não está saudável. Verifique o banco antes de publicar.',
        );
    }
    return deployment.sha;
  }
  throw new Error(
    'Nenhuma versão saudável de produção identificada; não é possível dispensar migrations.',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = process.argv[2];
  const adapters = {
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
            devNull,
            '--write-out',
            '%{http_code}',
            url,
          ],
          { encoding: 'utf8', timeout: 35000, stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      ),
    }),
  };
  if (sha === '--baseline') console.log(await productionBaseline(adapters));
  else {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Informe o SHA completo publicado.');
    await verifyProduction({ ...adapters, sha, sleep: setTimeout });
  }
}
