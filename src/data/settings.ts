import * as v from "valibot";
import { LocalDateSchema } from "../core/backup.ts";
import { MATERIAL_KINDS } from "../core/material.ts";
import { SNS_KINDS } from "../core/sns.ts";
import { SURFACE_KINDS } from "../core/surface.ts";

export const SETTINGS = {
  lastSns: v.object({ kind: v.picklist(SNS_KINDS), id: v.string() }),
  sound: v.boolean(),
  invitationShown: v.literal(true),
  backup: v.object({ receivedCount: v.pipe(v.number(), v.integer()), date: LocalDateSchema }),
  debug: v.object({ on: v.boolean(), unlockAll: v.boolean() }),
  materialsSeen: v.array(v.picklist(MATERIAL_KINDS)),
  surfacesSeen: v.array(v.picklist(SURFACE_KINDS)),
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = v.InferOutput<(typeof SETTINGS)[K]>;
