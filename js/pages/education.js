import { escapeHTML, icon } from '../components/ui.js';
import { educationChannels } from '../data/education.js';

export async function render(container) {
  container.innerHTML = `<section class="education-page">
    <header class="page-header"><div><h1>Aprenda a cuidar do seu dinheiro</h1><p class="muted">Assista aos vídeos, conheça os canais e descubra hábitos para organizar melhor suas finanças.</p></div></header>
    <section class="education-library" id="education-library" aria-label="Canais de educação financeira"><div class="education-grid">
      ${educationChannels.map(channel => `<article class="education-card panel">
        <div class="education-channel"><div class="channel-avatar"><img src="${escapeHTML(channel.avatar)}" alt="Foto do canal ${escapeHTML(channel.name)}" width="52" height="52" loading="lazy"><span class="youtube-channel-badge" aria-hidden="true">${icon('youtube')}</span></div><div class="education-channel-copy"><h3>${escapeHTML(channel.name)}</h3></div></div>
        <p class="education-channel-description muted">${escapeHTML(channel.description)}</p>
        <div class="video-container"><iframe src="https://www.youtube.com/embed/${channel.videoId}" title="Vídeo de referência do canal ${escapeHTML(channel.name)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
        <div class="education-video-info"><span class="education-channel-label">PARA APRENDER</span><h4>${escapeHTML(channel.suggestedTheme)}</h4></div>
        <div class="education-card-actions"><a class="btn btn-secondary" href="${escapeHTML(channel.channelUrl)}" target="_blank" rel="noopener noreferrer">Visitar canal ${icon('arrow-up-right')}</a><a class="btn btn-ghost" href="https://www.youtube.com/watch?v=${channel.videoId}" target="_blank" rel="noopener noreferrer">${icon('youtube')} Assistir no YouTube</a></div>
      </article>`).join('')}
    </div></section>
    <aside class="education-footer-note">${icon('lightbulb')}<div><strong>Uma ideia por vez já faz diferença.</strong><p>Depois de assistir, escolha uma ação simples: revisar uma assinatura, registrar seus gastos ou criar uma meta. Conhecimento ganha valor quando vira hábito.</p></div></aside>
  </section>`;
}
