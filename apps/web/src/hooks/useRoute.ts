import { useEffect, useState } from 'react';
export interface Route { page: string; id: string | null; }
function readRoute(): Route { const [page, id] = location.hash.replace(/^#\/?/, '').split('/'); return { page: page || 'groups', id: id ? decodeURIComponent(id) : null }; }
export function useRoute(): Route { const [route, setRoute] = useState(readRoute); useEffect(() => { const change = () => setRoute(readRoute()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []); return route; }
export function navigate(page: string, id?: string): void { location.hash = `/${page}${id ? `/${encodeURIComponent(id)}` : ''}`; }
