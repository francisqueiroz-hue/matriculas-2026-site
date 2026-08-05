import { useEffect, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db as dbRaw } from '../lib/firebase'

const db = dbRaw!
import { useAuth } from './useAuth'
import type { NewTransaction, Transaction } from '../types/finance'

export function useTransactions() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const col = collection(db, 'users', user.uid, 'transactions')
    const q = query(col, orderBy('date', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setTransactions(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) })),
      )
      setLoading(false)
    })
    return unsub
  }, [user])

  const addTransaction = async (tx: NewTransaction) => {
    if (!user) return
    await addDoc(collection(db, 'users', user.uid, 'transactions'), {
      ...tx,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      _server: serverTimestamp(),
    })
  }

  const updateTransaction = async (id: string, tx: Partial<NewTransaction>) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'transactions', id), {
      ...tx,
      updatedAt: Date.now(),
    })
  }

  const removeTransaction = async (id: string) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'transactions', id))
  }

  return { transactions, loading, addTransaction, updateTransaction, removeTransaction }
}
