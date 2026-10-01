import { BatchTimeline } from '../../../components/BatchTimeline';
import { TemperatureChartPlaceholder } from '../../../components/TemperatureChartPlaceholder';
import { ProvenancePanel } from '../../../components/ProvenancePanel';
export default function BatchDetail() {
  return <><h1>Batch detail</h1><p>Trang khung, chưa kết nối dữ liệu.</p><BatchTimeline /><TemperatureChartPlaceholder /><ProvenancePanel /></>;
}
