# Job Tracker / Job Application Copilot

Sistema personal para centralizar la búsqueda laboral, detectar oportunidades relevantes y acelerar el proceso de postulación con apoyo de automatización, scoring y generación de CV ATS.

## 🚀 Qué hace

Este proyecto me ayuda a:

- recolectar ofertas laborales desde múltiples fuentes
- normalizar y procesar empleos en un solo flujo
- generar matches según perfil, stack, seniority y modalidad
- preparar packs de postulación
- generar CV ATS en PDF
- operar el flujo desde WhatsApp
- mantener un CV base activo desde un panel admin

## ✨ Features principales

- **Pipeline de empleos**
  - collect
  - dedupe
  - enrich
  - rescore
  - notify

- **Fuentes integradas**
  - Get on Board
  - Chiletrabajos
  - LinkedIn email alerts
  - Computrabajo email alerts
  - Laborum

- **Matching y scoring**
  - keywords
  - seniority
  - modalidad
  - stack principal
  - filtros por perfil

- **Flujo de postulación**
  - evaluación rápida
  - resumen de calce
  - keywords ATS
  - mensaje para recruiter
  - carta de presentación
  - checklist
  - generación de CV ATS PDF

- **Operación por WhatsApp**
  - correr pipeline
  - ver matches
  - revisar detalle
  - preparar postulación
  - generar CV
  - aprobar pack
  - marcar postulado
  - ver link directo

- **Admin panel**
  - dashboard del pipeline
  - corridas
  - top matches
  - conversión
  - importación de CV base
  - activación del CV base actual

## 🧠 Problema que resuelve

Buscar trabajo de forma manual suele ser lento y repetitivo:

- revisar múltiples fuentes
- copiar links
- comparar ofertas
- adaptar CV
- ordenar postulaciones
- hacer seguimiento

Este proyecto centraliza ese proceso y convierte una búsqueda dispersa en un flujo más ordenado y reutilizable.

## 🛠 Stack

- **Frontend / App:** Next.js, React, TypeScript
- **Backend:** Node.js, API Routes / Server Actions
- **Base de datos:** Supabase, PostgreSQL
- **Deploy:** Vercel
- **Mensajería:** WhatsApp Cloud API
- **Automatización / IA:** generación de CV y contenido adaptado
- **Scraping / ingestión:** HTML, browser automation, email alerts

## ⚙️ Flujo general

```text
Fuentes -> Collect -> Dedupe -> Enrich -> Rescore -> Notify
                                      ↓
                               Matches relevantes
                                      ↓
                        Pack de postulación + CV ATS PDF
                                      ↓
                              Seguimiento por WhatsApp
📲 Comandos por WhatsApp

Algunos comandos soportados:

run → correr pipeline completo
matches → ver matches recientes
match 1 → ver detalle
preparar 1 → generar pack de postulación
pack 1 → ver pack completo
cv 1 → ver mejoras sugeridas al CV
carta 1 → ver carta de presentación
cvdoc 1 → generar CV ATS en PDF
confirmar 1 → aprobar pack
aplicado 1 → marcar como postulado
postulaciones → ver seguimiento
🧾 CV base administrable

El sistema incluye una vista admin para:

pegar un CV completo
parsearlo a una estructura interna
guardarlo como borrador
activar la versión que se usará como base en futuras postulaciones

Esto permite actualizar la base curricular sin tocar manualmente cada CV generado.

📌 Estado actual

MVP funcional para uso personal.

Actualmente permite:

recolectar empleos
generar matches
preparar postulaciones
generar CV ATS
usar WhatsApp como interfaz operativa
administrar un CV base activo

🔒 Notas

Este proyecto fue construido para uso personal y aprendizaje aplicado.
Las credenciales, tokens, variables sensibles y configuraciones privadas no están incluidas en el repositorio.

📬 Contacto
LinkedIn: Martín Vergara
GitHub: MartinVergaraQ