# PlannedWallet engineering workflow

Before every production deployment:
- Read `knowledge/`, pull `origin main`, and review upstream changes against the proposed implementation for overlaps, duplication and contradictions. Resolve conflicts deliberately; never force-push or discard upstream features to make a deployment pass.
- Update relevant `knowledge/` documentation and include it in the release commit. A shell script cannot perform semantic review: the agent must perform this review before supplying `--reviewed=<origin/main SHA>`.
- Use `./deploy.sh --prepare`, stage only reviewed files, then `./deploy.sh "Commit message" --reviewed=<SHA>`. See `knowledge/architecture/deployment.md`.
- Complete checks, build, pending migrations, main push, exact-commit Render status and health verification. Do not report a full deployment if any stage fails. Resolve failures and resume; report blocked authentication/network access and the precise command and machine required.
- Never commit credentials or private financial documents. Do not log connection strings, passwords or tokens.
