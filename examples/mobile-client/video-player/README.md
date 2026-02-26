# React Native Fishjam Video Player example

This example provides a minimal, working livestreaming app using Fishjam.

---

## Running the Example app

1.  Clone the repository:

    ```bash
    git clone https://github.com/fishjam-cloud/web-client-sdk.git
    cd web-client-sdk
    ```

2.  Install dependencies and build project:

    ```bash
    yarn
    yarn build
    ```

3.  Prebuild native files in example directory:

    ```bash
    cd examples/mobile-client/video-player
    npx expo prebuild --clean
    ```

    > [!NOTE]
    > Be sure to run `npx expo prebuild` and not `yarn prebuild` as there's an issue with path generation for the `ios/.xcode.env.local` file

4.  **Create a `.env` file** in the `examples/mobile-client/video-player` directory.

Add your fishjam ID:

```bash
EXPO_PUBLIC_FISHJAM_ID=<your_fishjam_ID>
```

5.  Build app:

    ```bash
    yarn ios
    yarn android
    ```
