// Light and sky for each time of day.
export const THEMES = {
  day: {
    sky: [[0, '#2f78d0'], [0.38, '#7fb6ea'], [0.5, '#cfe4f4'], [1, '#cfe4f4']], horizon: '#cfe4f4', fog: [150, 620],
    hemi: ['#e8f2ff', '#6d8a5a', 1.15], sun: ['#fff3dc', 2.7], sunAt: [38, 70, 24], bloom: 0.55, vignette: 0.42,
  },
  dusk: {
    sky: [[0, '#16204e'], [0.28, '#5b3f86'], [0.44, '#e9825a'], [0.5, '#ffc98a'], [1, '#ffc98a']], horizon: '#f4b684', fog: [130, 560],
    hemi: ['#ffc9a8', '#4a3f5c', 1.1], sun: ['#ffb070', 2.4], sunAt: [-60, 34, 30], bloom: 0.85, vignette: 0.55,
  },
  night: {
    sky: [[0, '#03050c'], [0.42, '#0a1024'], [0.5, '#1b2344'], [1, '#1b2344']], horizon: '#141a34', fog: [110, 480],
    hemi: ['#aebcff', '#252a3c', 1.55], sun: ['#dfe6ff', 2.0], sunAt: [-24, 80, 28], bloom: 1.15, vignette: 0.7,
  },
};
