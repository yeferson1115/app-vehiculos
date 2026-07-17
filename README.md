# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).


## Configuración del API de login

El login de la app se autentica contra el endpoint de Laravel definido por variables públicas de Expo:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EXPO_PUBLIC_LOGIN_PATH=/login
```

`EXPO_PUBLIC_API_URL` debe apuntar a la base del API de El Evaluador. Si pruebas desde un teléfono físico o emulador Android, cambia `localhost` por la IP o host accesible desde el dispositivo.


## Configuración del guardado de inspecciones

Cuando guardas una inspección, la app primero la conserva localmente en `AsyncStorage` para que puedas trabajar sin internet. Después intenta enviarla al servicio de Laravel y, si no hay conexión, queda marcada como pendiente para reenviarla desde la pantalla principal.

Puedes configurar el endpoint de guardado con:

```bash
EXPO_PUBLIC_INSPECTION_SAVE_PATH=/inspecciones/movil
```

La app envía un `multipart/form-data` a `EXPO_PUBLIC_API_URL + EXPO_PUBLIC_INSPECTION_SAVE_PATH` con estos campos:

- `client_id`: identificador local para evitar duplicados al reintentar.
- `placa`, `kilometraje`, `observaciones` y `fecha_inspeccion`.
- `origen`: valor fijo `app_movil`.
- `imagenes[]`: archivos capturados con la cámara.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
