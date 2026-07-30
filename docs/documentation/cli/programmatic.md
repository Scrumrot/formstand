# Programmatic API

Everything the binary does is importable, over two entry points.

## `formstand-cli/codegen`, the browser-safe surface

Every step downstream of the IR is a pure string builder: no `fs`, no `path`, no TypeScript compiler. That subpath bundles for the browser, a build script, or your own tool.

The pipeline is `zod schema → fromZod → FieldSpec IR → emitters`. You can build a `FieldSpec` by hand instead of calling `fromZod`, which is what lets a UI drive the generator without a schema file existing anywhere.

```ts
import { fromZod, emitPlainForm } from "formstand-cli/codegen";

const code = emitPlainForm({
  ir: fromZod(profileSchema),
  formName: "ProfileForm",
  schemaImport: { name: "profileSchema", from: "./profileSchema", kind: "named" },
});
```

Exports include `fromZod` and `isZodSchema`; the emitters `emitPlainForm`, `emitMuiForm`, `emitShadcnForm`, `emitChakraForm`, `emitMantineForm`, `emitAntdForm`, `emitTemplateForm`, and `emitModuleForm`; `emitZodSchema` and `emitInitialValues`; `joinModuleFiles`; `defineTemplate`; `parseUiTarget`; `labelFromName` and the casing helpers; and the `FieldSpec`, `EmitFormOptions`, `EmitModuleOptions`, `UiTarget`, and `VisualOptions` types.

[Per-field overrides](./config#per-field-component-overrides) are available here too: `parseFieldOverrides` validates a `fields` block and `applyFieldOverrides` stamps a walked IR, both pure data in and data out.

The playground's [Schema builder](https://scrumrot.github.io/formstand/examples/#/schema-builder) generates forms client-side through exactly this subpath. It is the same code that runs on `npx`, not a port of it.

## `formstand-cli`, the main entry

The main entry re-exports all of the above and adds the parts that need Node and the TypeScript compiler:

```ts
import { fromType, defineConfig } from "formstand-cli";

const { ir, typeName } = fromType("./types.ts", "Profile");
```

Import from `formstand-cli/codegen` for a browser bundle. The main entry pulls in the TypeScript compiler through `fromType` and will not bundle for the browser.
