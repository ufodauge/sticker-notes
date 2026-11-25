import * as v from "valibot";
import { LocalDateSchema } from "../core/backup.ts";
import { JarSelectionSchema } from "../core/jar-selection.ts";
import { MATERIAL_KINDS } from "../core/material.ts";
import { SNS_KINDS } from "../core/sns.ts";

export const SETTINGS = {
  lastSns: v.object({ kind: v.picklist(SNS_KINDS), id: v.string() }),
  view: v.picklist(["album", "jar"]),
  jar: JarSelectionSchema,
  sound: v.boolean(),
  invitationShown: v.literal(true),
  backup: v.object({ receivedCount: v.pipe(v.number(), v.integer()), date: LocalDateSchema }),
  debug: v.object({ on: v.boolean(), unlockAll: v.boolean() }),
  materialsSeen: v.array(v.picklist(MATERIAL_KINDS)),
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = v.InferOutput<(typeof SETTINGS)[K]>;
