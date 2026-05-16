# Astroship - Astro SAAS Starter Website Template

This Free Template is sponsored by [Web3Templates](https://web3templates.com)

## Live Demo

**[https://astroship.web3templates.com/](https://astroship.web3templates.com/)**

**[Download Astroship Template](https://web3templates.com/templates/astroship-starter-website-template-for-astro)**

## Upgrade to Astroship Pro Version

**[https://astroship-pro.web3templates.com/](https://astroship-pro.web3templates.com/)**

**[Purchase Astroship Pro — $49](https://web3templates.com/templates/astroship-pro-astro-saas-website-template)**


<!-- prettier-ignore -->
| Feature | Free Version | Pro Version |
| --- | ------ | --- |
| Astro v3 | ✅  | ✅ |
| Content Collections | ✅  | ✅ |
| Tailwind CSS   | ✅  | ✅ |
| Mobile Responsive | ✅  | ✅ |
| Working Contact Page | ✅  | ✅ |
| Pro Layouts & Features | ❌  | ✅ |
| Blog with Pagination | ❌ | ✅ |
| View Transitions | ❌ | ✅ |
| Advanced Homepage Design | ❌  | ✅ |
| Features Page | ❌  | ✅ |
| Integrations Page | ❌  | ✅ |
| Elegant 404 Page | ❌  | ✅ |
| 6 Months Support| ❌  | ✅  |
| Free Updates    | ✅  | ✅  |
| License         | GPL-2.0 | Commercial |
| &nbsp; | &nbsp;| &nbsp;|
| Pricing| Free|**$49**|
| &nbsp; | Wahkonsa Means Honor or Respect
<a href="https://web3templates.com/templates/astroship-pro-astro-saas-website-template">
<img width="160" alt="Upgrade to Pro" src="https://user-images.githubusercontent.com/1884712/199181300-37c2128e-d033-4145-a906-16fa5263a53b.png">
</a>

## Deploy this template

You can instantly clone this to your GitHub and deploy the site by clicking the below buttons to deploy to your chosen providers!

Click here to deploy on Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsurjithctly%2Fastroship&project-name=astroship&repository-name=astroship&demo-title=Astroship%20-%20Astro%20Starter%20Template&demo-description=Astroship%20is%20a%20starter%20template%20for%20startups%2C%20marketing%20websites%20%26%20landing%20pages.%20Built%20with%20Astro%2C%20TailwindCSS&demo-url=https%3A%2F%2Fastroship.web3templates.com%2F&demo-image=https%3A%2F%2Fuser-images.githubusercontent.com%2F1884712%2F200831799-10ef2456-a02e-4068-b580-4b5326f0b33b.png)

Click here to deploy on Netlify:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/surjithctly/astroship)

### Pagespeed Score

[![pagespeed](https://user-images.githubusercontent.com/1884712/210250214-7aa98167-7993-4b90-8138-326b8fa0c223.png)](https://pagespeed.web.dev/report?url=https%3A%2F%2Fastroship.web3templates.com%2F)


## Installation

If you are reading this on github, you can click on the "Use this template" button above to create a new repository from astroship to your account. Then you can do a `git clone` to clone it to your local system.

Alternatively, you can clone the project directly from this repo to your local system.

### 1. Clone the repo

```bash
git clone https://github.com/surjithctly/astroship.git myProjectName
# or
git clone https://github.com/surjithctly/astroship.git .
```

The `.` will clone it to the current directory so make sure you are inside your project folder first.

### 2. Install Dependencies

```bash
npm install
# or
yarn install
# or (recommended)
pnpm install
```

### 3. Start development Server

```bash
npm run dev
# or
yarn dev
# or (recommended)
pnpm dev
```

### Preview & Build

```bash
npm run preview
npm run build
# or
yarn preview
yarn build
# or (recommended)
pnpm preview
pnpm build
```

We recommend using [pnpm](https://pnpm.io/) to save disk space on your computer.

### Other Commands

```bash
pnpm astro ...
pnpm astro add
pnpm astro --help
```

## Project Structure

Inside of your Astro project, you'll see the following folders and files:

```
/
├── public/
│   └── ...
├── src/
│   ├── components/
│   │   └── ...
│   ├── layouts/
│   │   └── ...
│   └── pages/
│       └── ...
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

Any static assets, like images, can be placed in the `public/` directory.

## TailwindCSS

TailwindCSS is already configured in this repo, so you can start using it without any installation.

## Coloring Page Request Form

The `/request-coloring-page` page is a static Astro page with a friendly request form for students, teachers, and parents. Because this site is deployed on GitHub Pages, GitHub Pages cannot run server-side email code directly. The form posts to a separate serverless endpoint configured at build time with:

```bash
PUBLIC_COLORING_REQUEST_ENDPOINT="https://your-worker-or-function-url.example"
```

Set `PUBLIC_COLORING_REQUEST_ENDPOINT` as a GitHub Actions repository variable so the Pages build includes the endpoint URL. Locally, copy `.env.example` to `.env` and set the same value before running the dev server.

### Email Handler

A Cloudflare Worker-compatible handler is included at `serverless/coloring-request-worker.mjs`. It validates the required fields server-side, validates optional email format, uses a honeypot field, applies basic in-memory rate limiting, and sends the email through Resend.

Required Worker environment variables:

```bash
RESEND_API_KEY=""
EMAIL_FROM="Wahkonsa Lodge <no-reply@wahkonsalodge.com>"
EMAIL_TO="vlbanta@gmail.com"
ALLOWED_ORIGIN="https://wahkonsalodge.com"
```

`EMAIL_FROM` must be a sender/domain verified in Resend. `EMAIL_TO` defaults to `vlbanta@gmail.com` if it is not set.

### Local Testing

Install dependencies and start Astro:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:4321/request-coloring-page`. To test successful email delivery, run or deploy the serverless handler and set:

```bash
PUBLIC_COLORING_REQUEST_ENDPOINT="http://localhost:8787"
ALLOWED_ORIGIN="http://localhost:4321"
```

Then submit the form. If `PUBLIC_COLORING_REQUEST_ENDPOINT` is empty, the page still builds, but submissions show the generic error message because there is no server-side email endpoint to receive them.

## Credits

[Hero Illustration](https://www.figma.com/community/file/1108400791662599811) by [Streamline](https://www.streamlinehq.com/)

## 👀 Want to learn more?

Feel free to check out [Astro Docs](https://docs.astro.build) or jump into our [Discord Chat](https://web3templates.com/discord).

[![Built with Astro](https://astro.badg.es/v1/built-with-astro.svg)](https://astro.build)
