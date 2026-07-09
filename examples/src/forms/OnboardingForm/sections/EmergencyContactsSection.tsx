import { textInputProps } from "formstand";
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

  return (
    <div className="array-item" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
      <div>
        <input placeholder="Name" {...textInputProps(name)} />
        <div className="error" style={{ marginTop: 4 }}>
          {name.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input placeholder="Relationship" {...textInputProps(relationship)} />
        <div className="error" style={{ marginTop: 4 }}>
          {relationship.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input placeholder="Phone" type="tel" {...textInputProps(phone)} />
        <div className="error" style={{ marginTop: 4 }}>
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
        <div className="error" style={{ marginBottom: 8 }}>
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
