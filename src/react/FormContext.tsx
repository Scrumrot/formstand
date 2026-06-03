import {
  type ReactNode,
  createContext,
  useContext,
} from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";

export type FormProviderProps<TSchema extends z.ZodType> = Readonly<{
  form: Form<TSchema>;
  children: ReactNode;
}>;

export type FormContextApi<TSchema extends z.ZodType> = Readonly<{
  Provider: (props: FormProviderProps<TSchema>) => ReactNode;
  useFormContext: () => Form<TSchema>;
}>;

export const createFormContext = <
  TSchema extends z.ZodType,
>(): FormContextApi<TSchema> => {
  const Context = createContext<Form<TSchema> | null>(null);

  const Provider = ({ form, children }: FormProviderProps<TSchema>) => (
    <Context.Provider value={form}>{children}</Context.Provider>
  );

  const useFormContext = (): Form<TSchema> => {
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
