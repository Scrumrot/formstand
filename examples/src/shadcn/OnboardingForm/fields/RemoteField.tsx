import { FieldError } from "../../FieldError";
import { shadcnCheckboxProps } from "../../shadcnAdapter";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type RemoteFieldProps = Readonly<{ label?: string }>;

export const useRemoteField = () => useOnboardingField("employment.remote");

export const RemoteField = ({ label = "Fully remote" }: RemoteFieldProps) => {
  const field = useRemoteField();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Checkbox id="onbsc-employment.remote" {...shadcnCheckboxProps(field)} />
        <Label htmlFor="onbsc-employment.remote">{label}</Label>
      </div>
      <FieldError field={field} />
    </div>
  );
};
