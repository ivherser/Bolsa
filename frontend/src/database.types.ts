export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      watchlist: {
        Row: { id: number; user_id: string; ticker: string; created_at: string };
        Insert: { id?: never; user_id?: string; ticker: string; created_at?: string };
        Update: { ticker?: string };
        Relationships: [];
      };
      presets: {
        Row: { id: number; user_id: string; name: string; filtros: Json; created_at: string };
        Insert: { id?: never; user_id?: string; name: string; filtros: Json; created_at?: string };
        Update: { name?: string; filtros?: Json };
        Relationships: [];
      };
      notes: {
        Row: {
          id: number;
          user_id: string;
          ticker: string | null;
          contenido: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id?: string;
          ticker?: string | null;
          contenido: string;
          created_at?: string;
        };
        Update: { ticker?: string | null; contenido?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
