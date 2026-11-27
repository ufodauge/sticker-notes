import { useSyncExternalStore } from "react";
import { SNS, SNS_KINDS, isValidSnsId, normalizeSnsInput } from "../core/sns.ts";
import common from "./common.module.css";
import { t } from "./messages.ts";
import styles from "./MySnsField.module.css";
import { mySns } from "./my-sns.ts";
import { SnsIcon } from "./SnsIcon.tsx";

// The maker's SNS (my-sns.ts): the service, and the ID written on a line. Left empty, the QR
// carries none.
export function MySnsField() {
  const v = useSyncExternalStore(mySns.subscribe, mySns.get);
  const id = normalizeSnsInput(v.kind, v.input);
  const invalid = id !== "" && !isValidSnsId(v.kind, id);
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.sns.field}</legend>
      <div className={styles.sns}>
        <div className={styles.kinds} role="radiogroup" aria-label={t.sns.kind}>
          {SNS_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.kind === k}
              aria-label={SNS[k].label}
              title={SNS[k].label}
              className={styles.kind}
              onClick={() => mySns.set({ ...v, kind: k })}
            >
              <SnsIcon kind={k} size={18} />
            </button>
          ))}
        </div>
        <input
          className={common.input}
          aria-label={t.sns.id}
          placeholder={t.sns.id}
          value={v.input}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid}
          onChange={(e) => mySns.set({ ...v, input: e.currentTarget.value })}
        />
      </div>
      {invalid && <p className={common.warn}>{t.sns.invalid}</p>}
    </fieldset>
  );
}
