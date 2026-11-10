import { EpisodeDashboard } from '@/components/episode-dashboard';
import { listEpisodes } from '@/server/episodes/repository';
export const dynamic='force-dynamic';
export default function EpisodesPage(){return <EpisodeDashboard initialEpisodes={listEpisodes()}/>;}
