import { InfoButton } from '../components/InfoTip'
import { predictWords, type PredictWord } from './words'

/** A small ⓘ button that opens a short explanation (same look as the shared InfoTip). */
export function HelpTip({ term }: { term: PredictWord }) {
  return <InfoButton {...predictWords[term]} />
}
