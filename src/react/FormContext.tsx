import {
  type ReactNode,
  createContext,
  useContext,
} from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { DefaultPathDepth, PathDepth } from "../core/fieldPath";

export type FormProviderProps<
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
> = Readonly<{
  form: Form<TSchema, D>;
  children: ReactNode;
}>;

export type FormContextApi<
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
> = Readonly<{
  Provider: (props: FormProviderProps<TSchema, D>) => ReactNode;
  useFormContext: () => Form<TSchema, D>;
}>;

// A form created with a non-default `pathDepth` names it here too:
// createFormContext<typeof schema, 12>() — the context can't infer it (there
// is no value argument), and Form<S, 12> is deliberately not Form<S, 9>.
// The `PathDepth` constraint makes an out-of-range literal (26, -1) or a
// widened `number` argument a compile error, same as createForm's option.
export const createFormContext = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(): FormContextApi<TSchema, D> => {
  const Context = createContext<Form<TSchema, D> | null>(null);

  const Provider = ({ form, children }: FormProviderProps<TSchema, D>) => (
    <Context.Provider value={form}>{children}</Context.Provider>
  );

  const useFormContext = (): Form<TSchema, D> => {
    const ctx = useContext(Context);
    if (ctx === null) {
      throw new Error(
        "useFormContext must be used inside the matching <Provider>",
      );
    }
    return ctx;
  };

  return { Provider, useFormContext };
};
