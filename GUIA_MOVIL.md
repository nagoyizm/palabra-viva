# Guía para Publicar en Android (Google Play Store)

Para convertir esta aplicación web en una app nativa de Android, monetizarla con anuncios y permitir pagos para eliminarlos, la mejor ruta es utilizar **Capacitor**.

Capacitor "envuelve" tu sitio web existente en un contenedor nativo, permitiéndote acceder a funciones del celular y publicarla en la tienda sin tener que reescribir el código en otro lenguaje.

---

## 📅 Fase 1: Conversión a Móvil (Capacitor)

### 1. Preparación del Entorno
Necesitas tener instalado en tu computadora:
- **Android Studio** (para compilar la app final).
- **Node.js** (ya lo tienes).

### 2. Instalación de Capacitor
En tu proyecto, ejecuta estos comandos:
```bash
# Instalar núcleo de Capacitor
npm install @capacitor/core @capacitor/cli

# Inicializar Capacitor (Nombre App, ID de paquete ej: com.tuempresa.versiculo)
npx cap init# 🚀 Guía de Lanzamiento: Palabra Eterna

¡Felicidades! Tu aplicación está lista para ser publicada en Google Play Store. Aquí tienes los pasos finales para generar el archivo de producción.

## 1. Icono de la Aplicación
He generado un **icono profesional** para ti.
1. Busca el archivo `app_icon_....png` que acabo de crear.
2. Ve a este sitio web: [EasyAppIcon](https://easyappicon.com/) o usa Android Studio.
3. Arrastra la imagen y descarga el paquete "Android".
4. Reemplaza las carpetas `mipmap-` dentro de `android/app/src/main/res/` con las que descargues.

## 2. Configuración Final
- **Versión**: Tu app está en la versión `1.0` (código `1`). Si actualizas en el futuro, sube estos números en `android/app/build.gradle`.
- **Publicidad**: Los anuncios están configurados en MODO PRODUCCIÓN. **¡NO HAGAS CLIC EN ELLOS TÚ MISMO!**
- **API Key**: Recuerda que tu llave de Groq está en el código. Vigila tu cuota en console.groq.com.

## 3. Generar el APK/AAB Firmado (Android Studio)
Google Play requiere un archivo `.aab` (Android App Bundle) firmado.

1. Abre una terminal y actualiza todo por última vez:
   ```bash
   npm run build
   npx cap sync
   npx cap open android
   ```
2. En Android Studio:
   - Ve al menú **Build** -> **Generate Signed Bundle / APK**.
   - Selecciona **Android App Bundle** (Recomendado para Play Store) y dale a **Next**.
   - **Key Store Path**: Haz clic en "Create new...".
     - Guarda el archivo `.jks` en un lugar seguro (ej: `C:\Claves\palabraviva.jks`).
     - **Contraseñas**: Pon una contraseña fuerte y **GUÁRDALA**. Si la pierdes, no podrás actualizar la app nunca más.
     - **Alias**: `key0` (o lo que quieras).
     - Rellena al menos "First and Last Name" y "Country Code" (ej: ES, MX, AR).
   - Dale a **Next**.
   - Selecciona **release** y dale a **Create**.

3. **¡Listo!** Android Studio generará tu archivo `.aab` (normalmente en `android/app/release/`). Este es el archivo que subirás a Google Play Console.

## 4. Subir a Google Play Console
1. Crea una cuenta de desarrollador (cuesta $25 pago único).
2. Crea una nueva App ("Palabra Eterna").
3. Sube el archivo `.aab` en la sección de "Producción".
4. Rellena la ficha (descripción, capturas de pantalla, clasificación de contenido).
   - **Importante**: Marca que tu app contiene **Anuncios**.
   - **Privacidad**: Necesitarás una URL de política de privacidad (puedes generar una gratis en sitios como *flycricket.io* o *privacypolicygenerator.info*).

¡Mucha suerte con tu lanzamiento! Que "Palabra Eterna" bendiga a muchas personas. 🙏
### 1. Instalación
```bash
npm install @capacitor-community/admob
npx cap sync
```

### 2. Configuración
Debes crear una cuenta en [Google AdMob](https://admob.google.com/), crear una "App" y obtener tu `App ID` y `Ad Unit IDs`.

### 3. Código (Ejemplo Básico)
En tu `App.jsx` o componente principal:

```javascript
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

// Inicializar al arrancar la app
useEffect(() => {
  AdMob.initialize();
  
  // Mostrar Banner si el usuario NO es premium
  if (!isPremium) {
      AdMob.showBanner({
          adId: 'ca-app-pub-TU-ID-DE-PRUEBA', // Usar ID de prueba durante desarrollo
          adSize: BannerAdSize.BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
      });
  }
}, [isPremium]);
```

---

## 💎 Fase 3: Compras In-App (Quitar Anuncios)

La forma más fácil de gestionar suscripciones o compras únicas es usar **RevenueCat**. Simplifica enormemente la gestión compleja de Google Play Billing.

### 1. Instalación
```bash
npm install @capacitor-community/purchases-revenuecat
```
*(Nota: O usa el SDK oficial de RevenueCat para React si prefieres)*.

### 2. Lógica
1.  Crea el producto "remover_anuncios" en Google Play Console.
2.  Conecta Google Play con RevenueCat.
3.  En tu código, cuando el usuario compra, RevenueCat te devolverá si el usuario tiene el "entitlement" (derecho) activo.
4.  Si `entitlement == active`, ocultas el banner de AdMob.

---

## 🚀 Fase 4: Publicación

1.  Generar una **Cuenta de Desarrollador de Google** ($25 USD pago único).
2.  En Android Studio: `Build > Generate Signed Bundle / APK`.
3.  Subir el archivo `.aab` a la Google Play Console.
4.  Llenar fichas de la tienda (imágenes, descripción, política de privacidad).
5.  Enviar a revisión.
