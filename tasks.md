# Guía de Optimización Personal y Productividad

Bienvenido a tu panel de control y organización. Este documento está diseñado como una plantilla
maestra para gestionar tus objetivos, tareas diarias, hábitos y recursos de aprendizaje.

---

## 1. Filosofía de Trabajo

Para lograr la máxima eficiencia, aplicamos tres pilares fundamentales todos los días:

* **Enfoque implacable:** Eliminar las distracciones durante los bloques de trabajo profundo.
* **Iteración constante:** Revisar lo aprendido al final de cada semana para mejorar.
* **Automatización:** Delegar o programar tareas repetitivas usando código y herramientas.

> "La simplicidad es la clave de la verdadera brillantez." — Bruce Lee

---

## 2. Objetivos Principales del Año

### Desarrollo Profesional
1. Certificación avanzada en arquitectura de software en la nube.
2. Contribuir a tres proyectos de código abierto de alto impacto.
3. Aprender a fondo un nuevo lenguaje de programación funcional.

### Bienestar y Salud
1. Completar una carrera de media maratón (21k) antes de fin de año.
2. Mantener un promedio de 7.5 horas de sueño reparador por noche.
3. Practicar meditación o respiración guiada durante 10 minutos al día.

---

## 3. Matriz de Prioridades (Método Eisenhower)

| Urgente e Importante | No Urgente pero Importante |
| :--- | :--- |
| • Resolver bugs críticos en producción | • Planificar la estrategia del mes |
| • Entregar el reporte financiero | • Hacer ejercicio diario |
| • Atender la reunión con el cliente principal | • Estudiar para la certificación |

| Urgente pero No Importante | No Urgente y No Importante |
| :--- | :--- |
| • Responder correos electrónicos genéricos | • Revisar redes sociales sin rumbo |
| • Asistir a reuniones sin agenda clara | • Organizar archivos antiguos irrelevantes |
| • Atender llamadas telefónicas imprevistas | • Ver televisión en exceso |

---

## 4. Automatización con Scripts

A continuación se muestra un ejemplo de script en Python para organizar archivos por extensión de forma automática:

```python
import os
import shutil

def clasificar_archivos(directorio):
    for archivo in os.listdir(directorio):
        ruta_completa = os.path.join(directorio, archivo)
        if os.path.isfile(ruta_completa):
            extension = archivo.split('.')[-1]
            carpeta_destino = os.path.join(directorio, extension)
            os.makedirs(carpeta_destino, exist_ok=True)
            shutil.move(ruta_completa, carpeta_destino)

# Uso del script
# clasificar_archivos('/ruta/a/tu/carpeta')
```

---

## 5. Registro de Hábitos Diarios

Utiliza esta lista de verificación interactiva para medir tu progreso diario:

- [ ] [06:00 AM] Despertar y beber un vaso de agua.
- [ ] [07:00 AM] 30 minutos de lectura técnica o desarrollo personal.
- [ ] [08:30 AM] Bloque de trabajo enfocado de 90 minutos (sin celular).
- [ ] [12:00 PM] Almuerzo saludable y caminata ligera al aire libre.
- [ ] [02:00 PM] Revisión de correos y tareas administrativas menores.
- [ ] [05:00 PM] Sesión de entrenamiento físico o estiramientos.
- [ ] [09:30 PM] Desconexión digital de pantallas y preparación para dormir.

---

## 6. Recursos y Enlaces Útiles

Aquí puedes guardar los enlaces que consultas con mayor frecuencia en tu día a día:

* [Repositorio Principal del Proyecto](https://github.com)
* [Documentación Oficial del Framework](https://python.org)
* [Herramienta de Gestión de Tareas](https://trello.com)
* [Plataforma de Cursos en Línea](https://coursera.org)

---
