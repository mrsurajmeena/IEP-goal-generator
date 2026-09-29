# IEP AI Goal Generator — V2

AI-assisted web app based on the uploaded CBSE Individualised Education Plan (IEP) format.

## Structure
- `index.html` — Part A, Part B and Part C interface
- `app.js` — browser-side form handling
- `styles.css` — responsive and print styling
- `functions/api/generate.js` — Cloudflare Pages Function that calls the AI API
- `.gitignore` — keeps local secrets out of GitHub

## Privacy architecture
- No application database is used.
- Direct identifiers are intentionally excluded from the AI payload: student name/ID, DOB, parent name, address/contact, school name/ID.
- When AI generation is used, the selected non-identifying goal-related information is transmitted to the configured AI service.
- The UI therefore does not claim that AI-mode data never leaves the device.
- Review all AI-generated content before using it in an official IEP.

## Cloudflare setup
1. Create a public GitHub repository and upload these files.
2. Connect the repository to Cloudflare Pages.
3. In Cloudflare Pages → Settings → Variables and Secrets, add an encrypted Secret named `OPENAI_API_KEY`.
4. Optional: add a normal variable `OPENAI_MODEL` with value `gpt-6-luna` (or another model you have enabled).
5. Deploy.

Cloudflare documents encrypted Secrets for API keys and tokens; do not put API keys in client-side JavaScript or plaintext Git variables.

## Local testing
Create `.dev.vars` with:
`OPENAI_API_KEY="your-key-here"`

Never commit `.dev.vars` or `.env` files.

## Goal logic
The AI is instructed to use the baseline and target skill, create one annual goal and four staged short-term goals, and attach a suggested timeframe and measurement. Timeframes are suggestions and should be reviewed by the teacher/SET.
