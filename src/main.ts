import './styles.css';
import { supabase, isSupabaseConfigured } from './supabaseClient';
(window as any).sb = supabase;
(window as any).sbReady = isSupabaseConfigured;
import './data.js';
import './notifications.js';
import './app.js';
