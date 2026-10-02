import type { PostgrestError } from "@supabase/supabase-js";
import { cleanFilters, defaultState } from "./storage";
import { supabase } from "./supabase";
import type { Filters } from "./types";

export interface WatchItem {
  id: number;
  ticker: string;
}

export interface SavedPreset {
  id: number;
  name: string;
  filtros: Filters;
}

export interface Note {
  id: number;
  ticker: string | null;
  contenido: string;
  created_at: string;
}

function client() {
  if (!supabase) throw new Error("Supabase no está configurado");
  return supabase;
}

function dbError(error: PostgrestError, fallback: string): Error {
  if (error.code === "23505") return new Error("Ya existe");
  if (error.code === "23514") return new Error("Valor no válido");
  return new Error(fallback);
}

export async function listWatchlist(userId: string): Promise<WatchItem[]> {
  const { data, error } = await client()
    .from("watchlist")
    .select("id, ticker")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw dbError(error, "No se pudo cargar la watchlist");
  return data;
}

export async function addWatchItems(userId: string, tickers: string[]): Promise<WatchItem[]> {
  const { data, error } = await client()
    .from("watchlist")
    .upsert(
      tickers.map((ticker) => ({ user_id: userId, ticker })),
      { onConflict: "user_id,ticker", ignoreDuplicates: true },
    )
    .select("id, ticker");
  if (error) throw dbError(error, "No se pudo guardar en la watchlist");
  return data;
}

export async function removeWatchItem(userId: string, id: number): Promise<void> {
  const { error } = await client().from("watchlist").delete().eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "No se pudo eliminar de la watchlist");
}

export async function listPresets(userId: string): Promise<SavedPreset[]> {
  const { data, error } = await client()
    .from("presets")
    .select("id, name, filtros")
    .eq("user_id", userId)
    .order("name");
  if (error) throw dbError(error, "No se pudieron cargar los presets");
  const defaults = defaultState().filters;
  return data.map((p) => ({ id: p.id, name: p.name, filtros: cleanFilters(p.filtros, defaults) }));
}

export async function savePreset(
  userId: string,
  name: string,
  filtros: Filters,
): Promise<SavedPreset> {
  const { data, error } = await client()
    .from("presets")
    .upsert({ user_id: userId, name, filtros: { ...filtros } }, { onConflict: "user_id,name" })
    .select("id, name, filtros")
    .single();
  if (error) throw dbError(error, "No se pudo guardar el preset");
  return { id: data.id, name: data.name, filtros: cleanFilters(data.filtros, filtros) };
}

export async function deletePreset(userId: string, id: number): Promise<void> {
  const { error } = await client().from("presets").delete().eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "No se pudo eliminar el preset");
}

const NOTE_COLUMNS = "id, ticker, contenido, created_at";

export async function listNotes(userId: string): Promise<Note[]> {
  const { data, error } = await client()
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw dbError(error, "No se pudieron cargar las notas");
  return data;
}

export async function addNote(
  userId: string,
  ticker: string | null,
  contenido: string,
): Promise<Note> {
  const { data, error } = await client()
    .from("notes")
    .insert({ user_id: userId, ticker, contenido })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw dbError(error, "No se pudo guardar la nota");
  return data;
}

export async function updateNote(userId: string, id: number, contenido: string): Promise<Note> {
  const { data, error } = await client()
    .from("notes")
    .update({ contenido })
    .eq("id", id)
    .eq("user_id", userId)
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw dbError(error, "No se pudo actualizar la nota");
  return data;
}

export async function deleteNote(userId: string, id: number): Promise<void> {
  const { error } = await client().from("notes").delete().eq("id", id).eq("user_id", userId);
  if (error) throw dbError(error, "No se pudo eliminar la nota");
}
