---
layout: home

hero:
  name: formstand
  text: Zod-schema-first form state for React
  tagline: Your zod schema is the source of truth — for types, validation, and the UI. Backed by zustand.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/

features:
  - icon: 🧭
    title: Typed paths, end to end
    details: useField(form, "users.0.email") infers the value type from your schema. Writes are typed too — a typo'd path or wrong value type is a compile error.
  - icon: ⚡
    title: Per-field subscriptions
    details: Fields re-render only when their own slice changes. Field-scoped validation parses one field's subschema per keystroke, not the whole form — async refines included.
  - icon: 🛡️
    title: Schema and server errors, separated
    details: Validation owns one channel, your app owns the other. A background validation pass physically cannot wipe a "username taken" server error.
  - icon: 🧮
    title: Derived, not tracked
    details: Dirtiness is computed from values vs initial values — no bookkeeping to drift. diff() gives you a PATCH-ready payload of exactly what changed.
  - icon: 🗂️
    title: Field arrays that keep their keys
    details: Stable row IDs survive reorders, inserts, and removes — including edits that replace row objects.
  - icon: ♿
    title: Accessible bound components
    details: TextField, NumberField, SelectField, CheckboxField ship with aria-invalid, aria-describedby, role="alert", and focus-first-error out of the box.
---
