# Rollie Pollie Print Shop

A private, per-user picture wall for uploading, pasting, and printing images.

## Firebase project

- Project ID: `rolyrolyprintshop`
- Authentication: email and password
- Image metadata: Cloud Firestore
- Image files: Cloud Storage for Firebase
- Deployment: Firebase Hosting

The browser Firebase configuration is intentionally committed in `app.js`. Firebase web API keys identify the project; Firestore and Storage Security Rules enforce access.

## Run locally

```bash
npm run dev
```

The app starts on `http://localhost:3030` by default. Use another port with:

```bash
PORT=3031 npm run dev
```

## Deploy

```bash
npm run check
npm run deploy
```

Firebase Storage requires the project to use the Blaze plan. Link a billing account in the Firebase console before creating the default bucket or deploying `storage.rules`. The bucket is configured for `us-east1`, one of Google Cloud Storage's Always Free eligible regions.

## Data model

Image metadata is stored at `users/{uid}/images/{imageId}`. Image files are stored at `users/{uid}/images/{imageId}` in Cloud Storage. Security Rules only allow the signed-in owner to read or write those paths, and uploads are limited to images under 20 MB.

Pictures saved by the old local-only version remain in IndexedDB. After sign-in, the app offers to import them into the signed-in account and removes each local copy only after its cloud upload succeeds.
