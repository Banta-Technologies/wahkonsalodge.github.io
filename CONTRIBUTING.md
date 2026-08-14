# Contributing to Wahkonsa Lodge

Use a focused branch and pull request for normal changes:

```text
main
  ↑
pull request
  ↑
feature/* or fix/* branch
```

## Development workflow

1. Do not work directly on `main` for normal changes.
2. Create a focused `feature/*` or `fix/*` branch from an up-to-date `main`.
3. Make and review the change locally.
4. Run `pnpm repo:check` and fix every failure.
5. Commit logical, reviewable changes.
6. Push the branch and open a pull request into `main`.
7. Wait for the GitHub **Repo Check** workflow to pass.
8. Inspect the Cloudflare Pages preview, including responsive layouts when relevant.
9. Merge only after the automated checks and visual review are satisfactory.

## Repository safety

- Creative source files and editor backups do not belong in `public/`.
- The Noni & Papa creative master archive lives outside this repository. Publish
  completed comics with `pnpm noni-papa:sync`; repository checks validate only
  the website assets committed here.
- Use project-relative paths, `os.homedir()`, or environment variables instead of
  hard-coding a developer's home directory.
- Never commit secrets or local `.env` files. Use `.env.example` for documented
  placeholders.
