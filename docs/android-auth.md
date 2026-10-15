# Integración con Android en Java

Ejemplos para incorporar al proyecto Android; este repositorio contiene el servidor, por lo que no compila ni ejecuta la app móvil. Se asume Retrofit, su convertidor Gson y OkHttp configurados en el proyecto Android. Los DTOs Java usan los mismos nombres de campo que el JSON del servidor.

## Contratos de Retrofit

Crear `AuthApi.java` con el paquete correspondiente de la app:

```java
import java.util.List;
import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.Header;
import retrofit2.http.POST;

/** Endpoints JSON; las rutas protegidas reciben el encabezado Bearer completo. */
public interface AuthApi {
    @POST("auth/register")
    Call<AuthResponse> register(@Body RegisterRequest body);

    @POST("auth/login")
    Call<AuthResponse> login(@Body LoginRequest body);

    @GET("auth/me")
    Call<User> me(@Header("Authorization") String authorization);

    @POST("auth/logout")
    Call<Void> logout(@Header("Authorization") String authorization);

    @GET("users")
    Call<List<User>> users(@Header("Authorization") String authorization);

    /** Perfil público, sin contraseña ni hash. */
    class User {
        public String id;
        public String name;
        public String email;
        public String role;
    }

    /** Respuesta con un único JWT; su duración se expresa en segundos. */
    class AuthResponse {
        public String accessToken;
        public String tokenType;
        public long expiresIn;
        public User user;
    }

    /** Credenciales para abrir una sesión. */
    class LoginRequest {
        public final String email;
        public final String password;

        public LoginRequest(String email, String password) {
            this.email = email;
            this.password = password;
        }
    }

    /** Datos de registro; el rol lo asigna exclusivamente el servidor. */
    class RegisterRequest extends LoginRequest {
        public final String name;

        public RegisterRequest(String name, String email, String password) {
            super(email, password);
            this.name = name;
        }
    }

}
```

## Crear el cliente

Dentro de la clase que construye los servicios de red:

```java
import okhttp3.OkHttpClient;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

// Dirección del equipo anfitrión desde el emulador Android; solo para desarrollo.
String baseUrl = "http://10.0.2.2:3000/";

OkHttpClient httpClient = new OkHttpClient.Builder().build();
AuthApi authApi = new Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(httpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(AuthApi.class);
```

Agregar el permiso de Internet al manifiesto principal:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

En un dispositivo físico usar la IP local del servidor, estando ambos en la misma red. Para HTTP local, permitir tráfico sin cifrar **solo en la variante debug**, por ejemplo con `src/debug/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:usesCleartextTraffic="true" />
</manifest>
```

Si la app ya define `networkSecurityConfig`, ajustar su configuración debug en lugar de depender únicamente de este atributo. La variante de producción debe usar una URL HTTPS.

## Flujo de sesión

1. Llamar `login(...)` o `register(...)` con `enqueue(...)` para evitar bloquear el hilo principal. Cuando la respuesta sea exitosa y tenga cuerpo, guardar únicamente `accessToken`. No guardar la contraseña.
2. Consultar `authApi.me("Bearer " + accessToken)` u otros recursos protegidos.
3. Si una petición protegida devuelve **401**, borrar el JWT y mostrar login. El token no se renueva: el usuario debe autenticarse otra vez.
4. **403** indica permisos insuficientes. **429** indica que hay que esperar antes de volver a intentar. Ante un fallo de red o 5xx conservar el JWT para permitir reintentar mientras siga vigente.
5. Al cerrar sesión, enviar `logout("Bearer " + accessToken)`. La respuesta 204 no tiene cuerpo. Borrar siempre el JWT local. Si ya venció, basta con borrarlo; si no hay conectividad, la sesión remota permanece válida hasta el vencimiento.

El JWT puede mantenerse en memoria. Si se necesita conservar el inicio de sesión al cerrar la app, persistirlo cifrado con una clave protegida por **Android Keystore**, por ejemplo AES/GCM con un IV nuevo por cifrado. Guardar únicamente el texto cifrado y el IV en almacenamiento privado excluido de copias de seguridad. No escribir el JWT en logs ni incluir `JWT_SECRET` en el APK. Un rol leído por el cliente sirve para adaptar la interfaz: el servidor siempre verifica los permisos.

Referencias: [Retrofit](https://square.github.io/retrofit/), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [red del emulador](https://developer.android.com/studio/run/emulator-networking) y [configuración de seguridad de red](https://developer.android.com/privacy-and-security/security-config).
