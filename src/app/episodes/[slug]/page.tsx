import { notFound } from 'next/navigation';
import { ProductionWorkspace } from '@/components/production-workspace';
import { pipelineView } from '@/server/pipeline/service';
import { getEpisodeBySlug } from '@/server/episodes/repository';
export const dynamic='force-dynamic';
export default async function EpisodeDetailPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  if(!getEpisodeBySlug(slug))notFound();
  return <ProductionWorkspace initial={pipelineView(slug)}/>;
}
