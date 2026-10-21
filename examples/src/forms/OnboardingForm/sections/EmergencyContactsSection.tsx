import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import {
  useOnboardingField,
  useOnboardingFieldArray,
  useOnboardingIsDirty,
  useOnboardingIsValid,
} from "../hooks";

export type EmergencyContactsSectionProps = Readonly<{
  initiallyOpen?: boolean;
}>;

// The array section's hook carries the field array alongside the scoped
// flags; row fields bind with template paths, so they stay schema-typed.
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
  // The row path is the id: unique per row, and what the error line
  // derives its own id from, as the bound components do.
  const nameA11y = fieldA11y(name, name.path);
  const relationshipA11y = fieldA11y(relationship, relationship.path);
  const phoneA11y = fieldA11y(phone, phone.path);

  return (
    <div className="array-item" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
      <div>
        <input
          placeholder="Name"
          aria-label="Contact name"
          {...textInputProps(name)}
          {...nameA11y.control}
        />
        <div {...nameA11y.message} style={{ marginTop: 4 }}>
          {name.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input
          placeholder="Relationship"
          aria-label="Relationship"
          {...textInputProps(relationship)}
          {...relationshipA11y.control}
        />
        <div {...relationshipA11y.message} style={{ marginTop: 4 }}>
          {relationship.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input
          placeholder="Phone"
          aria-label="Contact phone"
          type="tel"
          {...textInputProps(phone)}
          {...phoneA11y.control}
        />
        <div {...phoneA11y.message} style={{ marginTop: 4 }}>
          {phone.error?.[0] ?? " "}
        </div>
      </div>
      <button className="secondary" type="button" onClick={onRemove}>
        ×
      </button>
    </div>
  );
};

export const EmergencyContactsSection = ({
  initiallyOpen = false,
}: EmergencyContactsSectionProps) => {
  const { contacts, dirty, valid } = useEmergencyContactsSection();

  return (
    <details open={initiallyOpen || undefined}>
      <summary style={{ cursor: "pointer", marginBottom: 8 }}>
        <strong>Emergency contacts</strong>{" "}
        {dirty ? <span className="pending">edited</span> : null}{" "}
        {valid ? null : <span className="error">needs attention</span>}
      </summary>
      {contacts.fields.map((entry, index) => (
        <ContactRow
          key={entry.id}
          index={index}
          onRemove={() => contacts.remove(index)}
        />
      ))}
      {contacts.error ? (
        <div className="error" role="alert" style={{ marginBottom: 8 }}>
          {contacts.error[0]}
        </div>
      ) : null}
      <button
        className="secondary"
        type="button"
        onClick={() =>
          contacts.push({ name: "", relationship: "", phone: "" })
        }
      >
        + add contact
      </button>
    </details>
  );
};
