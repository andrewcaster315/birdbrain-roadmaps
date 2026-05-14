// A small picker that lets the user choose a User reference for an item's
// owner, or fall back to free-text (e.g. "Growth team").

import { useData } from "../data/DataContext";
import styles from "./UserPicker.module.css";

type Props = {
  ownerId: string | null;
  ownerText: string;
  onChangeOwnerId: (id: string | null) => void;
  onChangeOwnerText: (text: string) => void;
  ariaLabelPrefix?: string;
};

export const UserPicker = ({
  ownerId,
  ownerText,
  onChangeOwnerId,
  onChangeOwnerText,
  ariaLabelPrefix = "Owner",
}: Props) => {
  const { service } = useData();
  const users = service.listUsers();

  return (
    <div className={styles.wrap}>
      <select
        className={styles.select}
        value={ownerId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChangeOwnerId(v === "" ? null : v);
          if (v !== "") onChangeOwnerText(""); // clear free-text if a user is chosen
        }}
        aria-label={`${ariaLabelPrefix} — user`}
      >
        <option value="">— No assigned user —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName} ({u.email})
          </option>
        ))}
      </select>
      <input
        className={styles.input}
        type="text"
        value={ownerText}
        onChange={(e) => onChangeOwnerText(e.target.value)}
        placeholder='Or a free-text label (e.g. "Growth team")'
        aria-label={`${ariaLabelPrefix} — free text fallback`}
        disabled={!!ownerId}
      />
      <p className={styles.hint}>
        Pick a person from the directory, or use a free-text label for groups
        like "Growth team." Free text is ignored if a person is selected.
      </p>
    </div>
  );
};
