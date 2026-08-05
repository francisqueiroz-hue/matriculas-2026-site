import { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
} from 'firebase/firestore'
import { db as dbRaw } from '../lib/firebase'

const db = dbRaw!
import { useAuth } from './useAuth'
import type { Category, NewCategory } from '../types/finance'
import { defaultCategories } from '../data/defaultCategories'

export function useCategories() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const col = collection(db, 'users', user.uid, 'categories')
    const q = query(col, orderBy('order'))
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty && !snap.metadata.fromCache) {
        const batch = writeBatch(db)
        defaultCategories.forEach((cat) => {
          batch.set(doc(col), cat)
        })
        await batch.commit()
        return
      }
      setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as NewCategory) })))
      setLoading(false)
    })
    return unsub
  }, [user])

  const addCategory = async (cat: NewCategory) => {
    if (!user) return
    await addDoc(collection(db, 'users', user.uid, 'categories'), cat)
  }

  const updateCategory = async (id: string, cat: Partial<NewCategory>) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'categories', id), cat)
  }

  const removeCategory = async (id: string) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'categories', id))
  }

  return { categories, loading, addCategory, updateCategory, removeCategory }
}
