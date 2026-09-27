'use client'

// DocumentFull (Task 26-b) — содержимое полноэкранного просмотра документа Госуслуг.
// Паспорт рисуется особым макетом (фото + ФИО + серия/номер), остальные —
// универсальной карточкой с цветной шапкой. Внизу каждого документа — QR.

import { BadgeCheck, ShieldCheck } from 'lucide-react'
import type { GosDoc, GosUserData } from '@/lib/gos-docs'
import { DOC_GRADIENTS, DOC_ICONS } from './ui'
import FakeQR from './FakeQR'

function QrBlock({ doc }: { doc: GosDoc }) {
  return (
    <div className="rounded-[22px] bg-white p-5 shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl border border-[#F0F1F5] p-2.5">
          <FakeQR payload={doc.qr} size={150} />
        </div>
        <p className="max-w-[220px] break-all text-center font-mono text-[10px] leading-snug text-[#9AA0A8]">{doc.qr}</p>
        <span className="flex items-center gap-1.5 rounded-full bg-[#0AC760]/10 px-3 py-1.5 text-[12px] font-semibold text-[#067A47]">
          <BadgeCheck className="size-4" strokeWidth={2.2} />
          Документ действителен
        </span>
      </div>
    </div>
  )
}

function FieldGrid({ doc }: { doc: GosDoc }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      {doc.fields.map((f) => (
        <div key={f.label} className={f.wide ? 'col-span-2' : ''}>
          <div className="text-[10.5px] uppercase tracking-wide text-[#9AA0A8]">{f.label}</div>
          <div className="mt-0.5 text-[13.5px] font-semibold leading-snug text-[#17181A]">{f.value}</div>
        </div>
      ))}
    </div>
  )
}

function DocPhoto({ user, name }: { user: GosUserData; name: string }) {
  if (user.photoUrl) {
    return (
      <div className="shrink-0">
        <img loading="lazy" decoding="async" src={user.photoUrl}
          alt={`Фото: ${name}`}
          className="h-[118px] w-[92px] rounded-xl border border-[#F0F1F5] object-cover"/>
        <div className="mt-1 text-center text-[9px] uppercase tracking-widest text-[#9AA0A8]">Фото</div>
      </div>
    )
  }
  return (
    <div className="shrink-0">
      <div
        className="flex h-[118px] w-[92px] items-center justify-center rounded-xl border border-[#F0F1F5]"
        style={{ background: 'linear-gradient(150deg,#E8F0FF 0%,#D5E3FB 100%)' }}
      >
        <span className="text-[26px] font-bold text-[#0D4CD3]">
          {name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('')}
        </span>
      </div>
      <div className="mt-1 text-center text-[9px] uppercase tracking-widest text-[#9AA0A8]">Фото</div>
    </div>
  )
}

export default function DocumentFull({ doc, user }: { doc: GosDoc; user: GosUserData }) {
  const fullName = doc.fio
    ? `${doc.fio.last} ${doc.fio.first} ${doc.fio.patronymic}`
    : user.displayName

  if (doc.id === 'passport') {
    return (
      <div className="space-y-3.5 px-4 pb-6 pt-1">
        <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
          <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: 'linear-gradient(120deg,#0D4CD3 0%,#377FF3 100%)' }}>
            <ShieldCheck className="size-8 shrink-0 text-white/90" strokeWidth={1.8} />
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/75">Российская Федерация</div>
              <div className="mt-0.5 text-[15px] font-bold leading-tight">Паспорт гражданина РФ</div>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex gap-4">
              <DocPhoto user={user} name={fullName} />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Фамилия</div>
                  <div className="text-[16px] font-bold leading-tight text-[#17181A]">{doc.fio?.last}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Имя</div>
                  <div className="text-[16px] font-bold leading-tight text-[#17181A]">{doc.fio?.first}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Отчество</div>
                  <div className="text-[16px] font-bold leading-tight text-[#17181A]">{doc.fio?.patronymic}</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#F5F6F8] px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Серия / Номер</div>
              <div className="mt-0.5 font-mono text-[24px] font-bold tracking-[0.14em] text-[#17181A]">{doc.number}</div>
            </div>
            <FieldGrid doc={doc} />
          </div>
        </div>
        <QrBlock doc={doc} />
      </div>
    )
  }

  // Универсальный макет: шапка с градиентом, крупный номер, поля, QR
  const [c1, c2] = DOC_GRADIENTS[doc.id]
  const Icon = DOC_ICONS[doc.icon]
  return (
    <div className="space-y-3.5 px-4 pb-6 pt-1">
      <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_2px_10px_rgba(15,35,95,0.05)]">
        <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ background: `linear-gradient(120deg, ${c1} 0%, ${c2} 100%)` }}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon className="size-[19px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight">{doc.title}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/75">{doc.subtitle}</div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          {doc.fio && doc.id === 'international' && doc.fioLatin && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#F5F6F8] px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Фамилия (лат.)</div>
                <div className="text-[14px] font-bold uppercase leading-tight text-[#17181A]">{doc.fioLatin.last}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">Имя (лат.)</div>
                <div className="text-[14px] font-bold uppercase leading-tight text-[#17181A]">{doc.fioLatin.first}</div>
              </div>
            </div>
          )}
          <div className="rounded-2xl bg-[#F5F6F8] px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-[#9AA0A8]">
              {doc.id === 'snils' ? 'Страховой номер' : doc.id === 'oms' ? 'Полис' : doc.id === 'inn' ? 'ИНН' : 'Номер документа'}
            </div>
            <div className="mt-0.5 font-mono text-[20px] font-bold tracking-[0.1em] text-[#17181A]">{doc.number}</div>
          </div>
          <FieldGrid doc={doc} />
          {doc.validUntil && (
            <div className="flex items-center gap-1.5 text-[11.5px] text-[#9AA0A8]">
              <BadgeCheck className="size-4 text-[#067A47]" strokeWidth={2.1} />
              Документ действителен до {new Date(doc.validUntil).toLocaleDateString('ru-RU')}
            </div>
          )}
        </div>
      </div>
      <QrBlock doc={doc} />
    </div>
  )
}
