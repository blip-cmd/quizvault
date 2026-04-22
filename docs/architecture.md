# Architecture & Scalability

QuizVault is an **Offline-First, Static Progressive Web App (PWA)**. 

## The Edge CDN Model
Because the app does not run a traditional server back-end (like Node.js or Python) and does not host a centralized database, it is completely immune to traditional API load bottlenecks. 

By deploying strictly static files (HTML/CSS/JS) to a global Edge CDN like Vercel, Cloudflare Pages, or GitHub Pages, 42,000 parallel users merely download the cached asset from the server node physically closest to them. The deployment server experiences practically zero load and compute cost.

## Database-less Operation
User state (themes, options) and large data models (imported custom quizzes, user progress mapping) are stored securely on the end-user's actual device via the browser's native `localStorage` API.
This removes the need for global connection pooling and expensive horizontal scaling.

## Bring Your Own Key (BYOK) AI
AI capabilities natively utilize standard browser-level `fetch()` bindings pulling directly from the `generativelanguage.googleapis.com` endpoints.
By demanding the user supply their own personal API key for deep-explaining quiz aspects, the developer avoids accruing usage bills.

## Handling Quotas & Boundaries
`localStorage` provides about **~5MB** of free storage per URL origin on most common mobile and desktop browsers. 
When power users exceed this by saving dozens of 120-question JSON exams to the device, the code catches the native `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED` thrown by the browser, blocks the specific write attempt to prevent corruption, and gracefully toasts:
**"Storage full! Delete some quizzes to save new data."**

*(Future Roadmap Idea: Refactor away from `localStorage` synchronous operations towards the `IndexedDB` async interface to open up virtually unlimited gigabytes of persistent storage.)*
