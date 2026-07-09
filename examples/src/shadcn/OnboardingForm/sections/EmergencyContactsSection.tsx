import { textInputProps } from "formstand";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { FieldError } from "../../FieldError";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  useOnboardingField,
  useOnboardingFieldArray,
  useOnboardingIsDirty,
  useOnboardingIsValid,
} from "../hooks";

export type EmergencyContactsSectionProps = Readonly<{
  initiallyOpen?: boolean;
}>;

// The array section's hook carries the field array alongside the
// path-scoped flags; row fields bind template paths, so they stay
// schema-typed.
export const useEmergencyContactsSection = () => ({
  contacts: useOnboardingFieldArray("emergencyContacts"),
  dirty: useOnboardingIsDirty("emergencyContacts"),
  valid: useOnboardingIsValid("emergencyContacts"),
});

const ContactRow = ({
  index,
  onRemove,
}: Readonly<{ index: number; onRemove: () => void }>) => {
  const name = useOnboardingField(`emergencyContacts.${index}.name`);
  const relationship = useOnboardingField(
    `emergencyContacts.${index}.relationship`,
  );
  const phone = useOnboardingField(`emergencyContacts.${index}.phone`);
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-2">
      <div className="grid gap-1">
        <Input placeholder="Name" {...textInputProps(name)} />
        <FieldError field={name} />
      </div>
      <div className="grid gap-1">
        <Input placeholder="Relationship" {...textInputProps(relationship)} />
        <FieldError field={relationship} />
      </div>
      <div className="grid gap-1">
        <Input placeholder="Phone" type="tel" {...textInputProps(phone)} />
        <FieldError field={phone} />
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove contact"
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
};

export const EmergencyContactsSection = ({
  initiallyOpen = false,
}: EmergencyContactsSectionProps) => {
  const { contacts, dirty, valid } = useEmergencyContactsSection();
  return (
    <details className="rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        Emergency contacts
        {dirty ? <Badge>edited</Badge> : null}
        {valid ? null : (
          <span className="text-xs text-destructive">needs attention</span>
        )}
      </summary>
      <div className="grid gap-3 px-4 pb-4">
        {contacts.fields.map((entry, index) => (
          <ContactRow
            key={entry.id}
            index={index}
            onRemove={() => contacts.remove(index)}
          />
        ))}
        {contacts.error ? (
          <p className="text-sm text-destructive" role="alert">
            {contacts.error[0]}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            contacts.push({ name: "", relationship: "", phone: "" })
          }
        >
          <PlusIcon />
          Add contact
        </Button>
      </div>
    </details>
  );
};
