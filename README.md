### `npm install`

### `npm start`

Runs the app in the development mode.<br />

If repository is a localhost:
Open [https://localhost:3000] to view it in the browser.

If repository is a remote web server: - Open [https://<REMOTE SERVER>:3000] to view it in the browser. - IMPORTANT: You need to follow the following procedure https://medium.com/@danielgwilson/https-and-create-react-app-3a30ed31c904
in order to use https and access WebServer through secure WebRtc and WebSocket.

The page will reload if you make edits.<br />
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.<br />

### `npm run build`

Builds the app for production to the `build` folder.<br />
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br />
Your app is ready to be deployed!

### `Compile telephony and build teletest with p911`

ruby import.rb
cd teletest
npm run build:imported
npm install && npm run build
