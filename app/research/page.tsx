import ResearchWorkspace from '@/components/dashboard/ResearchWorkspace';
import SectorHeatmap from '@/components/dashboard/SectorHeatmap';

export const metadata={title:'시장 리서치'};

export default function Page(){
 return <>
  <ResearchWorkspace/>
  <SectorHeatmap/>
 </>;
}
