import { QualityIssueTable } from '../../components/QualityIssueTable';
import { ExceptionTable } from '../../components/ExceptionTable';
import { QAReviewPanel } from '../../components/QAReviewPanel';
export default function Page() { return <><h1>QA review</h1><QualityIssueTable /><ExceptionTable /><QAReviewPanel /></>; }
