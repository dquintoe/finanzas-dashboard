# Dashboard de finanzas personales

Sitio estático (GitHub Pages) que lee **BD_Finanzas_Dante** (Google Sheets) con inicio de sesión de Google.

- **Administrador**: ve el dashboard y además tiene los botones *Actualizar BD*, *Estado de lectura* y *Usuarios*.
- **Visualizador**: solo ve el dashboard.
- **Cualquier otra cuenta**: acceso denegado.

## Arquitectura

```
index.html                  Estructura de la página
assets/css/styles.css       Estilos (modo claro/oscuro, móvil)
assets/js/config.js         Configuración (Client ID, ID del Sheet, URL de la web app)
assets/js/auth.js           Inicio de sesión con Google Identity Services (token OAuth en memoria)
assets/js/sheetsRepo.js     Acceso a datos: Google Sheets API v4, SOLO LECTURA
assets/js/model.js          Reglas de negocio e indicadores (lógica pura, con pruebas)
assets/js/charts.js         Gráficos (Chart.js)
assets/js/views.js          Render de KPIs y tablas
assets/js/app.js            Controlador: login → carga → rol → render → filtros
tests/model.test.mjs        Pruebas del modelo (necesita tests/fixture.json local, no se publica)
```

### Seguridad
- El dashboard pide solo permiso de **lectura** de Sheets. No puede modificar la BD.
- Quién ve los datos lo decide Google: la cuenta debe tener el Sheet compartido. Además, el rol se valida contra la hoja `Usuarios`.
- Las acciones de Administrador se ejecutan en la web app del Apps Script, que vuelve a validar el rol: actualizar la BD y agregar o desactivar cuentas (compartiendo o retirando el acceso al Sheet).
- El repositorio no contiene datos financieros. El Client ID de OAuth y el ID del Sheet no son secretos: sin permiso de Google no se puede leer nada.
