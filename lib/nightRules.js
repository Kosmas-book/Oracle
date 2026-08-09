// ΜΟΝΑΔΙΚΗ πηγή για τους κανόνες του νυχτερινού κύκλου.
// Χρησιμοποιείται από generator, rebalance, live validator, server validator.

// Repeat exception: ο επόμενος βραδινός είναι ο ίδιος που μόλις ολοκλήρωσε
// το προηγούμενο μπλοκ (A → B → A). Τότε δεν απαιτείται νέο Ρ Σαββάτου.
export function isRepeatException(nextNightPerson, prevNightPerson) {
  return (
    !!nextNightPerson && !!prevNightPerson && nextNightPerson === prevNightPerson
  );
}

// Απαιτείται Ρ το Σάββατο πριν από την έναρξη του μπλοκ;
export function requiresSaturdayRest(nextNightPerson, prevNightPerson) {
  return (
    !!nextNightPerson && !isRepeatException(nextNightPerson, prevNightPerson)
  );
}
