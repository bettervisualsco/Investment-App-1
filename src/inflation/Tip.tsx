// ⓘ button for the Inflation tab's own terms (same look as the Planner's).

import { InfoButton } from '../components/InfoTip'
import { inflationWords, type InflationWord } from './words'

/** ⓘ button for the Inflation tab's own terms. */
export function Tip({ term }: { term: InflationWord }) {
  return <InfoButton {...inflationWords[term]} />
}
