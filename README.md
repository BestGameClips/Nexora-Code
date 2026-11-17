# Nexura Code

**Un environnement de développement desktop moderne, personnalisable et en cours de construction.**

> [!CAUTION]
> **PROJET EN DÉVELOPPEMENT — TÉLÉCHARGEMENT ET UTILISATION DÉCONSEILLÉS POUR LE MOMENT**
>
> RustIDE Ultimate dispose déjà d'une **base utilisable**, mais il ne s'agit **pas d'une version stable ni prête pour une utilisation quotidienne**. De nombreuses fonctionnalités sont encore en développement, peuvent être incomplètes ou présenter des bugs.
>
> **Il n'existe actuellement aucun système de mise à jour intégré ou automatique.** Une version téléchargée aujourd'hui ne recevra donc pas automatiquement les correctifs et améliorations à venir.
>
> **Il est fortement recommandé de ne pas télécharger ni installer le projet pour le moment**, sauf si vous souhaitez participer au développement ou effectuer des essais en connaissance de cause. N'utilisez pas cette version pour des projets ou données importants sans sauvegarde indépendante.

## Présentation

**RustIDE Ultimate** est un projet d'IDE (environnement de développement intégré) pour ordinateur, visant à proposer une interface moderne, une édition de code agréable et, progressivement, les outils nécessaires au développement logiciel au même endroit.

L'objectif à long terme est de proposer une alternative personnalisable aux éditeurs de code traditionnels, avec un accent sur l'ergonomie, les performances, la sécurité et l'extensibilité.

**Le projet n'en est qu'à ses premières étapes : il possède une base exploitable, mais son développement est toujours actif.** Les captures d'écran présentent l'interface actuelle, et non une garantie que tous les outils visibles ou envisagés sont entièrement fonctionnels.

## État actuel

| Élément | Statut |
| --- | --- |
| Base de l'application et interface | Base utilisable, en évolution |
| Explorateur de fichiers et onglets d'édition | Présents dans l'interface actuelle ; fonctionnement à consolider |
| Éditeur de code et coloration | Interface d'édition visible ; fonctionnalités à valider au fil du développement |
| Paramètres d'apparence et thèmes | Interface de personnalisation visible ; en évolution |
| Fonctions avancées (Git, terminal, débogage, LSP, extensions...) | En cours d'étude, de développement ou prévues selon les modules |
| Tests complets de stabilité et compatibilité | Non garantis à ce stade |
| Installateur stable pour le grand public | Non annoncé |
| **Système de mises à jour intégré / automatique** | **Non disponible** |

> [!IMPORTANT]
> La présence d'un bouton, d'un panneau ou d'une option ne signifie pas nécessairement que la fonctionnalité est finalisée. Les éléments non confirmés comme opérationnels ne doivent pas être considérés comme stables.

## Aperçu de l'interface

La base actuelle comprend notamment une interface inspirée des IDE modernes, avec un explorateur de projet, des onglets de fichiers, une zone d'édition, une barre d'état et une page de paramètres proposant plusieurs thèmes clairs et sombres.

Les captures d'écran de l'avancement peuvent être ajoutées à ce README dans un dossier `docs/screenshots/` lorsque celui-ci sera disponible.

## Objectifs du projet

Les fonctionnalités suivantes décrivent la **direction du développement**, et **non une liste de fonctionnalités déjà terminées** :

- **Éditeur de code :** prise en charge de plusieurs langages, coloration syntaxique, recherche, édition multi-onglets et outils d'assistance.
- **Gestion des projets :** explorateur de fichiers, espaces de travail et restauration des sessions.
- **Personnalisation :** thèmes clairs/sombres, réglages de l'apparence et raccourcis clavier.
- **Outils développeur :** terminal intégré, Git, recherche globale, diagnostics et débogage.
- **Fonctionnalités intelligentes :** intégration progressive du protocole LSP pour l'assistance au code.
- **Extensibilité :** architecture permettant à terme la prise en charge d'extensions.
- **Distribution :** installateurs, notes de version et système de mises à jour sécurisé à mettre en place avant une publication stable.

La priorité est de livrer des fonctions réellement fiables et vérifiables, plutôt que de multiplier des éléments d'interface incomplets.

## Technologies envisagées

L'architecture cible définie pour RustIDE Ultimate s'appuie principalement sur :

| Domaine | Technologies ciblées |
| --- | --- |
| Application desktop | Rust et Tauri 2 |
| Interface utilisateur | React, TypeScript et Vite |
| Édition de code | Monaco Editor |
| Assistance aux langages | LSP, puis outils complémentaires selon les besoins |
| Terminal intégré | xterm.js et PTY natif |
| Recherche avancée | ripgrep |
| Données locales | SQLite |
| Gestion des versions | Git et, à terme, intégration GitHub |

Cette liste présente la **stack cible** du projet. Elle ne garantit pas que toutes ces technologies sont déjà intégrées ou pleinement opérationnelles dans la version actuelle.

## Pourquoi le téléchargement est-il déconseillé ?

RustIDE Ultimate est encore un projet expérimental. À ce stade :

1. **La stabilité n'est pas garantie.** Certaines actions peuvent provoquer des erreurs ou des comportements inattendus.
2. **Des fonctions peuvent être absentes ou incomplètes.** L'interface est amenée à changer.
3. **Il n'y a pas de système de mise à jour.** Les nouvelles versions ne seront pas installées automatiquement.
4. **La compatibilité n'est pas totalement validée.** Le fonctionnement peut varier selon la configuration et le système d'exploitation.
5. **Les changements peuvent être importants d'une version à l'autre.** Les paramètres ou formats internes peuvent évoluer.

**En conséquence, il est préférable d'attendre une première version publique suffisamment testée avant de l'utiliser.**

## Installation et essais (développeurs uniquement)

**Aucune procédure d'installation destinée au grand public n'est recommandée à ce stade.**

Le code source peut être consulté à des fins d'exploration ou de contribution. Les personnes souhaitant effectuer des essais doivent examiner les fichiers de configuration et les instructions de compilation réellement présents dans le dépôt avant de lancer le projet.

L'organisation des dossiers, les commandes de compilation et les dépendances pourront évoluer sans préavis tant que le projet restera en développement.

> [!WARNING]
> Avant toute expérimentation, sauvegardez vos fichiers et utilisez de préférence un projet de test. Ne considérez pas cette version comme votre éditeur principal.

## Feuille de route

La feuille de route suivante est indicative. Son ordre et son contenu peuvent évoluer.

- [ ] **Fondations :** consolider la fenêtre principale, l'explorateur, les onglets, les paramètres et les raccourcis.
- [ ] **Édition :** fiabiliser l'ouverture, la modification et la sauvegarde des fichiers, ainsi que la recherche.
- [ ] **Outils de développement :** intégrer et tester le terminal, Git, les diagnostics, le LSP et le débogage.
- [ ] **Personnalisation :** enrichir les thèmes, les profils et les options d'interface.
- [ ] **Extensions :** définir et sécuriser les mécanismes d'extension.
- [ ] **Qualité :** renforcer les tests, l'accessibilité, la compatibilité et la gestion des erreurs.
- [ ] **Distribution :** préparer des installateurs vérifiés, des publications documentées et un **système de mises à jour sécurisé**.
- [ ] **Première version stable :** publier uniquement après validation des fonctions essentielles.

Ces cases ne constituent pas un audit du code actuel : elles représentent les **étapes à finaliser et à valider** avant de considérer le projet comme prêt pour le public.

## Mises à jour et versions

**RustIDE Ultimate ne propose actuellement ni vérification automatique des nouvelles versions, ni téléchargement de correctifs depuis l'application, ni mise à jour automatique.**

Le système de publication et de mise à jour fait partie des objectifs futurs. Tant qu'il n'est pas implémenté et testé, toute version obtenue doit être considérée comme indépendante et potentiellement rapidement obsolète.

Une documentation des versions et des changements sera publiée progressivement lorsque le processus de distribution sera suffisamment fiable.

## Contributions et retours

Les retours techniques, suggestions et signalements de bugs peuvent être utiles pendant le développement. Avant de proposer un changement, vérifiez si la fonction concernée est réellement implémentée et documentez les étapes permettant de reproduire un éventuel problème.

Le projet étant encore en construction, les conventions de contribution et les procédures de publication peuvent évoluer.

## Questions fréquentes

**Puis-je utiliser RustIDE Ultimate dès maintenant ?**  
Une base utilisable existe, mais **l'utilisation n'est pas recommandée pour le moment**, en particulier comme IDE principal.

**Le projet est-il abandonné ?**  
Non : il est présenté comme **en cours de développement**. La disponibilité des nouveautés dépendra de l'avancement réel du projet.

**Toutes les fonctionnalités visibles sont-elles opérationnelles ?**  
Pas nécessairement. Certains éléments peuvent encore être incomplets, expérimentaux ou en cours d'intégration.

**Les mises à jour sont-elles automatiques ?**  
**Non. Aucun système de mises à jour n'est disponible actuellement.**

**Quand sortira une version stable ?**  
**Aucune date de sortie stable n'est annoncée.** La priorité reste la fiabilité des fonctions fondamentales.

**Dois-je télécharger le projet maintenant ?**  
**Non, ce n'est pas conseillé.** Attendez une publication annoncée comme suffisamment stable et documentée.

---

### Note finale

RustIDE Ultimate est un projet ambitieux qui se construit étape par étape. **La base actuelle permet de faire avancer le développement, mais ne constitue pas encore un produit finalisé.** Merci de votre intérêt et de votre compréhension pendant cette phase de développement.

**Statut :** développement actif · **Stabilité :** non garantie · **Mises à jour automatiques :** indisponibles · **Téléchargement :** déconseillé pour le moment
