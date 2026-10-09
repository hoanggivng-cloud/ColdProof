export interface QAException { id: string; batch_id: string; profile_id: string | null; status: string; record_ids: string[]; created_at: string }
export interface QAReview { id: string; exception_id: string; reviewer_id: string; status: string; notes: string | null; created_at: string }
export interface QAQueueData { exceptions: QAException[]; reviews: QAReview[] }
